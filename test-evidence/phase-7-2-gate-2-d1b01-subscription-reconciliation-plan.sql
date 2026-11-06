-- ==============================================================================
-- MEETWISE AI — PLANO DE RECONCILIAÇÃO FINANCEIRA: FIN-REC-01
-- ==============================================================================
-- FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.1-C
-- Projeto: ycxwomqqepetickmxxqj
--
-- Alvo: Subscrição sintética da Organização Alpha
-- ID Subscrição: 95034a46-8e5a-45dc-bf25-520009a48be2
-- ID Organização: 3f737a15-22e9-48d1-b7d9-7ae806a2d3fc
--
-- Objetivo:
-- Restaurar o plano Free original (ec6ea177-e266-49a7-bb74-b1c03a687fda) e
-- vigência legítima de referência (2026-12-06T06:14:27Z), revertendo a
-- adulteração para Enterprise (2099) provocada na prova de conceito D1.A.
--
-- Correção de Tipagem: resource_id na tabela audit_logs é do tipo UUID.
-- ==============================================================================

DO $$
DECLARE
  v_target_org_id CONSTANT UUID := '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc';
  v_target_sub_id CONSTANT UUID := '95034a46-8e5a-45dc-bf25-520009a48be2';
  v_free_plan_id UUID;
  v_sub_id UUID;
  v_current_plan_id UUID;
  v_current_period_start TIMESTAMPTZ;
  v_current_period_end TIMESTAMPTZ;
  v_legitimate_period_start CONSTANT TIMESTAMPTZ := '2026-11-06T06:14:27Z'::timestamptz;
  v_legitimate_period_end CONSTANT TIMESTAMPTZ := '2026-12-06T06:14:27Z'::timestamptz;
BEGIN
  -- 1. Recupera o ID do plano Free legítimo
  SELECT id INTO v_free_plan_id FROM public.plans WHERE code = 'free';

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano Free não encontrado no catálogo de planos.';
  END IF;

  -- 2. Localiza a subscrição sintética da Org Alpha com bloqueio FOR UPDATE
  SELECT id, plan_id, current_period_start, current_period_end
  INTO v_sub_id, v_current_plan_id, v_current_period_start, v_current_period_end
  FROM public.subscriptions
  WHERE organization_id = v_target_org_id
    AND id = v_target_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscrição da Org Alpha (%) não encontrada.', v_target_sub_id;
  END IF;

  -- 3. Aplica reconciliação se a subscrição estiver com plano ou vigência adulterados
  IF v_current_plan_id <> v_free_plan_id OR v_current_period_end > (NOW() + INTERVAL '365 days') THEN
    UPDATE public.subscriptions
    SET
      plan_id = v_free_plan_id,
      current_period_start = v_legitimate_period_start,
      current_period_end = v_legitimate_period_end,
      updated_at = NOW()
    WHERE id = v_sub_id;

    -- 4. Registra evento de auditoria compensatório oficial (resource_id é UUID)
    INSERT INTO public.audit_logs (
      id,
      organization_id,
      action,
      resource_type,
      resource_id,
      metadata,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_target_org_id,
      'security.subscription_reconciled',
      'subscription',
      v_sub_id,
      jsonb_build_object(
        'protocol', 'FIN-REC-01',
        'phase', 'D1.B.1-C',
        'restored_plan_code', 'free',
        'restored_plan_id', v_free_plan_id,
        'restored_period_start', v_legitimate_period_start,
        'restored_period_end', v_legitimate_period_end,
        'previous_tampered_plan_id', v_current_plan_id,
        'previous_tampered_period_start', v_current_period_start,
        'previous_tampered_period_end', v_current_period_end,
        'reconciliation_timestamp', NOW()
      ),
      NOW()
    );

    RAISE NOTICE 'Reconciliação FIN-REC-01 concluída com sucesso para a subscrição % (Plano: Free, Fim: %).', 
      v_sub_id, v_legitimate_period_end;
  ELSE
    RAISE NOTICE 'Subscrição % já se encontra em estado legítimo (idempotente). Nenhuma alteração efetuada.', v_sub_id;
  END IF;
END $$;
