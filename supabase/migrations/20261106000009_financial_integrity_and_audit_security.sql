-- ==============================================================================
-- MEETWISE AI — Multi-Tenant Security Remediation: Migration 009
-- Migration: 20261106000009_financial_integrity_and_audit_security.sql
-- Description: Remediates VULN-001 (invoices), VULN-002 (subscriptions), and
--              VULN-003 (audit_logs). Implements strict field protection triggers,
--              least-privilege RLS policies, and server-side identity/timestamp
--              enforcement to prevent direct PostgREST financial and audit tampering.
-- ==============================================================================

-- 1. HARDENING DA TABELA INVOICES (VULN-001)
-- Revogar política ampla FOR ALL e substituir por política restrita de leitura/gestão controlada
DROP POLICY IF EXISTS "invoices_manage_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;

-- Política de UPDATE restrita a Owners/Admins (apenas para colunas não financeiras como billing_details ou pdf_url)
CREATE POLICY "invoices_update_admin" ON public.invoices
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- Trigger de Salvaguarda Financeira de Faturas
CREATE OR REPLACE FUNCTION public.protect_invoice_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  -- Se a operação é executada por um utilizador autenticado (não service_role/backend)
  IF NULLIF(current_setting('request.jwt.claim.role', true), '') = 'authenticated' THEN
    -- Proibir alteração de status financeiro
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of invoice status is prohibited.';
    END IF;

    -- Proibir alteração de montantes
    IF NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents OR
       NEW.tax_cents IS DISTINCT FROM OLD.tax_cents OR
       NEW.total_cents IS DISTINCT FROM OLD.total_cents OR
       NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of invoice financial amounts is prohibited.';
    END IF;

    -- Proibir alteração de identificadores de fatura e transação
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
       NEW.payment_reference IS DISTINCT FROM OLD.payment_reference OR
       NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of invoice payment references is prohibited.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_invoice_fields ON public.invoices;
CREATE TRIGGER trg_protect_invoice_fields
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_financial_fields();


-- 2. HARDENING DA TABELA SUBSCRIPTIONS (VULN-002)
-- Revogar política ampla FOR ALL e substituir por política restrita de cancelamento
DROP POLICY IF EXISTS "subscriptions_manage_owner" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_owner" ON public.subscriptions;

-- Política de UPDATE restrita a cancelamento por Owner/Admin
CREATE POLICY "subscriptions_update_owner" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- Trigger de Salvaguarda Financeira de Subscrições
CREATE OR REPLACE FUNCTION public.protect_subscription_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  -- Se a operação é executada por utilizador comum autenticado
  IF NULLIF(current_setting('request.jwt.claim.role', true), '') = 'authenticated' THEN
    -- Proibir alteração de plano contratado (upgrade forçado)
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of subscription plan is prohibited. Use checkout.';
    END IF;

    -- Proibir alteração de status de subscrição
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of subscription status is prohibited.';
    END IF;

    -- Proibir alteração de datas de vigência (extensão arbitrária)
    IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end OR
       NEW.current_period_start IS DISTINCT FROM OLD.current_period_start THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of subscription period dates is prohibited.';
    END IF;

    -- Proibir alteração de moeda, intervalo e provedor
    IF NEW.currency IS DISTINCT FROM OLD.currency OR
       NEW.billing_interval IS DISTINCT FROM OLD.billing_interval OR
       NEW.provider IS DISTINCT FROM OLD.provider OR
       NEW.external_subscription_id IS DISTINCT FROM OLD.external_subscription_id THEN
      RAISE EXCEPTION 'Security Violation: Direct modification of billing interval or provider is prohibited.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_financial_fields();


-- 3. HARDENING DA TABELA AUDIT LOGS (VULN-003)
-- Revogar política anterior de INSERT e recriar com validação de utilizador e imutabilidade
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_delete" ON public.audit_logs;

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids())
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Políticas explícitas para rotear tentativas de UPDATE/DELETE ao trigger com exceção clara
CREATE POLICY "audit_logs_reject_update" ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "audit_logs_reject_delete" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- Trigger de Integridade Forense e Sanitização Server-Side de Audit Logs
CREATE OR REPLACE FUNCTION public.protect_audit_log_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Imutabilidade estrita: Proibir UPDATE e DELETE absolutamente
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Security Violation: Audit logs are strictly immutable and cannot be updated or deleted.';
  END IF;

  -- Se inserido por utilizador autenticado
  IF NULLIF(current_setting('request.jwt.claim.role', true), '') = 'authenticated' THEN
    -- 1. Forçar autoria real server-side (elimina falsificação de user_id)
    NEW.user_id := auth.uid();

    -- 2. Forçar timestamp atual server-side (elimina retrodatação de eventos)
    NEW.created_at := NOW();

    -- 3. Proteger eventos administrativos contra falsificação por membros comuns
    IF (NEW.action LIKE 'admin.%' OR NEW.action LIKE 'security.%' OR NEW.action LIKE 'billing.%') THEN
      SELECT role INTO v_role
      FROM public.organization_members
      WHERE organization_id = NEW.organization_id AND user_id = auth.uid() AND status = 'active';

      IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Security Violation: Standard members cannot emit administrative or security audit events.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_integrity ON public.audit_logs;
CREATE TRIGGER trg_audit_log_integrity
BEFORE INSERT OR UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.protect_audit_log_integrity();


-- 4. REGISTO IDEMPOTENTE NO HISTÓRICO DE MIGRAÇÕES
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
      VALUES ('20261106000009', '20261106000009_financial_integrity_and_audit_security')
      ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version)
      VALUES ('20261106000009')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
