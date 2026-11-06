-- ==============================================================================
-- MEETWISE AI — MIGRAÇÃO 010: CONCURRENCY SAFETY & QUOTA ATOMICITY
-- ==============================================================================
-- FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.1
-- Versão: 20261106000010
--
-- Objetivos:
-- 1. CRIT-RC-01: Serializar alterações em membros de organizações com bloqueio
--    pessimista (FOR UPDATE) na linha da organização em protect_last_owner,
--    eliminando a condição de corrida em READ COMMITTED que permitia 0 owners.
-- 2. CRIT-RC-02: Implementar RPCs transacionais atómicas para reserva, liberação
--    e liquidação de quotas (reserve_organization_quota, release_organization_quota,
--    settle_organization_quota) com bloqueio pessimista e verificação de saldo.
-- ==============================================================================

-- 1. CRIT-RC-01: HARDENING DO TRIGGER protect_last_owner COM SERIALIZAÇÃO
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  active_owners_count INTEGER;
BEGIN
  -- Se um owner estiver a ser eliminado ou a sua role/status alterados
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    
    -- Serialização estrita: bloqueia a linha da organização correspondente para evitar condições de corrida
    -- em que dois owners se despromovem ou eliminam concorrentemente sob o nível de isolamento READ COMMITTED.
    PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;

    SELECT COUNT(*) INTO active_owners_count
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;

    IF active_owners_count < 1 THEN
      RAISE EXCEPTION 'Security Violation: Cannot remove or demote the last remaining active owner of an organization.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.organization_members;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();


-- 2. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE RESERVA DE QUOTA
CREATE OR REPLACE FUNCTION public.reserve_organization_quota(
  p_organization_id UUID,
  p_minutes NUMERIC,
  p_idempotency_key TEXT,
  p_operation TEXT DEFAULT 'transcription_minutes',
  p_ttl_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE (
  reserved BOOLEAN,
  reservation_id UUID,
  remaining_minutes NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_existing_expires TIMESTAMPTZ;
  v_sub_status TEXT;
  v_plan_limit NUMERIC;
  v_settled_minutes NUMERIC;
  v_active_reserved_minutes NUMERIC;
  v_total_used NUMERIC;
  v_remaining NUMERIC;
  v_new_id UUID;
BEGIN
  -- 1. Verificação de permissões do chamador (PostgREST RLS / JWT)
  v_user_id := auth.uid();
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
          ELSE NULL END),
    current_user
  );

  IF v_role NOT IN ('service_role', 'postgres') THEN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Security Violation: Authentication required.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id
        AND user_id = v_user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Security Violation: User is not an active member of this organization.';
    END IF;
  END IF;

  -- 2. Idempotência estrita: se a chave já foi processada
  SELECT id, status, expires_at
  INTO v_existing_id, v_existing_status, v_existing_expires
  FROM public.organization_quota_reserves
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_status = 'active' AND v_existing_expires > NOW() THEN
      -- Calcula saldo remanescente atual
      SELECT p.monthly_minutes_included INTO v_plan_limit
      FROM public.subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = p_organization_id;
      IF v_plan_limit IS NULL THEN
        SELECT monthly_minutes_included INTO v_plan_limit FROM public.plans WHERE code = 'free';
      END IF;

      SELECT COALESCE(SUM(quantity), 0) INTO v_settled_minutes
      FROM public.usage_ledger
      WHERE organization_id = p_organization_id AND operation = p_operation AND status = 'settled';

      SELECT COALESCE(SUM(reserved_quantity), 0) INTO v_active_reserved_minutes
      FROM public.organization_quota_reserves
      WHERE organization_id = p_organization_id AND status = 'active' AND expires_at > NOW();

      v_remaining := GREATEST(0, COALESCE(v_plan_limit, 0) - (v_settled_minutes + v_active_reserved_minutes));
      RETURN QUERY SELECT true, v_existing_id, v_remaining;
      RETURN;
    ELSE
      RAISE EXCEPTION 'Idempotency Conflict: Key % was already processed with status %', p_idempotency_key, v_existing_status;
    END IF;
  END IF;

  -- 3. Bloqueio pessimista FOR UPDATE na organização para garantir serialização atómica
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

  -- 4. Validação do estado da subscrição e limites do plano
  SELECT s.status, p.monthly_minutes_included
  INTO v_sub_status, v_plan_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_organization_id;

  IF NOT FOUND THEN
    -- Fallback para plano Free se não houver subscrição formal
    SELECT 'active', monthly_minutes_included INTO v_sub_status, v_plan_limit
    FROM public.plans WHERE code = 'free';
  END IF;

  IF v_sub_status IN ('suspended', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Subscription Inactive: Cannot reserve quota when subscription is %', v_sub_status;
  END IF;

  -- 5. Cálculo atómico do consumo consolidado e reservas ativas
  SELECT COALESCE(SUM(quantity), 0) INTO v_settled_minutes
  FROM public.usage_ledger
  WHERE organization_id = p_organization_id AND operation = p_operation AND status = 'settled';

  SELECT COALESCE(SUM(reserved_quantity), 0) INTO v_active_reserved_minutes
  FROM public.organization_quota_reserves
  WHERE organization_id = p_organization_id AND status = 'active' AND expires_at > NOW();

  v_total_used := v_settled_minutes + v_active_reserved_minutes;
  v_remaining := GREATEST(0, COALESCE(v_plan_limit, 0) - v_total_used);

  IF v_remaining < p_minutes THEN
    RAISE EXCEPTION 'Quota Exceeded: Requested % minutes, but only % remain in active cycle (limit: %, used: %).',
      p_minutes, v_remaining, v_plan_limit, v_total_used;
  END IF;

  -- 6. Gravação atómica da nova reserva
  v_new_id := gen_random_uuid();
  INSERT INTO public.organization_quota_reserves (
    id,
    organization_id,
    operation,
    reserved_quantity,
    unit,
    idempotency_key,
    status,
    expires_at,
    created_at
  ) VALUES (
    v_new_id,
    p_organization_id,
    p_operation,
    p_minutes,
    'minutes',
    p_idempotency_key,
    'active',
    NOW() + (GREATEST(60, p_ttl_seconds) || ' seconds')::INTERVAL,
    NOW()
  );

  v_remaining := v_remaining - p_minutes;
  RETURN QUERY SELECT true, v_new_id, v_remaining;
END;
$$;


-- 3. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE LIBERAÇÃO DE QUOTA
CREATE OR REPLACE FUNCTION public.release_organization_quota(
  p_reservation_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
  v_res RECORD;
BEGIN
  SELECT * INTO v_res
  FROM public.organization_quota_reserves
  WHERE id = p_reservation_id OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Verificação de permissões do chamador
  v_user_id := auth.uid();
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
          ELSE NULL END),
    current_user
  );

  IF v_role NOT IN ('service_role', 'postgres') THEN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Security Violation: Authentication required.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = v_res.organization_id
        AND user_id = v_user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Security Violation: User is not an active member of this organization.';
    END IF;
  END IF;

  -- Serializa na organização
  PERFORM 1 FROM public.organizations WHERE id = v_res.organization_id FOR UPDATE;

  UPDATE public.organization_quota_reserves
  SET status = 'released'
  WHERE id = v_res.id AND status = 'active';

  RETURN true;
END;
$$;


-- 4. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE LIQUIDAÇÃO DE QUOTA
CREATE OR REPLACE FUNCTION public.settle_organization_quota(
  p_reservation_id UUID,
  p_actual_minutes NUMERIC,
  p_meeting_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  settled BOOLEAN,
  settled_minutes NUMERIC,
  ledger_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
  v_res RECORD;
  v_new_ledger_id UUID;
  v_settle_key TEXT;
BEGIN
  SELECT * INTO v_res
  FROM public.organization_quota_reserves
  WHERE id = p_reservation_id OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation Not Found: ID %', p_reservation_id;
  END IF;

  -- Verificação de permissões do chamador
  v_user_id := auth.uid();
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
          ELSE NULL END),
    current_user
  );

  IF v_role NOT IN ('service_role', 'postgres') THEN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Security Violation: Authentication required.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = v_res.organization_id
        AND user_id = v_user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Security Violation: User is not an active member of this organization.';
    END IF;
  END IF;

  -- Serializa na organização
  PERFORM 1 FROM public.organizations WHERE id = v_res.organization_id FOR UPDATE;

  -- Marca a reserva como liquidada
  UPDATE public.organization_quota_reserves
  SET status = 'settled'
  WHERE id = v_res.id;

  -- Grava no usage_ledger de forma idempotente
  v_settle_key := 'settle_' || v_res.idempotency_key;
  v_new_ledger_id := gen_random_uuid();

  INSERT INTO public.usage_ledger (
    id,
    organization_id,
    meeting_id,
    operation,
    quantity,
    unit,
    idempotency_key,
    status,
    cost_cents_usd,
    created_at
  ) VALUES (
    v_new_ledger_id,
    v_res.organization_id,
    p_meeting_id,
    v_res.operation,
    p_actual_minutes,
    v_res.unit,
    v_settle_key,
    'settled',
    ROUND(p_actual_minutes * 2.5), -- $0.025 / min
    NOW()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET quantity = EXCLUDED.quantity
  RETURNING id INTO v_new_ledger_id;

  RETURN QUERY SELECT true, p_actual_minutes, v_new_ledger_id;
END;
$$;


-- 5. GRANTS DE EXECUÇÃO DAS RPCS
REVOKE ALL ON FUNCTION public.reserve_organization_quota(UUID, NUMERIC, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_organization_quota(UUID, NUMERIC, TEXT, TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_organization_quota(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_organization_quota(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_organization_quota(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_organization_quota(UUID, NUMERIC, UUID, TEXT) TO authenticated, service_role;


-- 6. REGISTO IDEMPOTENTE NO HISTÓRICO DE MIGRAÇÕES
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name'
    ) THEN
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20261106000010', '20261106000010_concurrency_and_quota_atomicity')
      ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version)
      VALUES ('20261106000010')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
