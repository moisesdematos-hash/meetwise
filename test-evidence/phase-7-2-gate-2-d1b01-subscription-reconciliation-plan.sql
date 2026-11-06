-- ==============================================================================
-- MEETWISE AI — PLANO DE RECONCILIAÇÃO FINANCEIRA: FIN-REC-01
-- ==============================================================================
-- FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.1
-- Status: PREPARADO EXCLUSIVAMENTE PARA REVISÃO LOCAL — NÃO EXECUTAR NO CLOUD
--
-- Alvo: Subscrição sintética da Organização Alpha
-- ID Subscrição: 95034a46-8e5a-45dc-bf25-520009a48be2
-- ID Organização: 3f737a15-22e9-48d1-b7d9-7ae806a2d3fc
--
-- Objetivo:
-- Restaurar o plano Free original (ec6ea177-e266-49a7-bb74-b1c03a687fda) e
-- vigência regular de 30 dias, revertendo a adulteração para Enterprise (2099)
-- provocada na prova de conceito D1.A.
-- ==============================================================================

DO $$
DECLARE
  v_free_plan_id UUID;
  v_sub_id UUID;
  v_current_plan_id UUID;
  v_current_period_end TIMESTAMPTZ;
BEGIN
  -- 1. Recupera o plano Free legítimo
  SELECT id INTO v_free_plan_id FROM public.plans WHERE code = 'free';

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano Free não encontrado no catálogo de planos.';
  END IF;

  -- 2. Localiza a subscrição sintética da Org Alpha
  SELECT id, plan_id, current_period_end
  INTO v_sub_id, v_current_plan_id, v_current_period_end
  FROM public.subscriptions
  WHERE organization_id = '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc'
    AND id = '95034a46-8e5a-45dc-bf25-520009a48be2';

  IF NOT FOUND THEN
    RAISE NOTICE 'Subscrição da Org Alpha não encontrada ou já reconciliada.';
    RETURN;
  END IF;

  -- 3. Aplica reconciliação se a subscrição estiver com plano ou vigência adulterados
  IF v_current_plan_id <> v_free_plan_id OR v_current_period_end > (NOW() + INTERVAL '365 days') THEN
    UPDATE public.subscriptions
    SET
      plan_id = v_free_plan_id,
      current_period_end = NOW() + INTERVAL '30 days',
      updated_at = NOW()
    WHERE id = v_sub_id;

    -- 4. Registra evento de auditoria compensatório oficial
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
      '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc',
      'security.subscription_reconciled',
      'subscription',
      v_sub_id::text,
      jsonb_build_object(
        'protocol', 'FIN-REC-01',
        'phase', 'D1.B.0.1',
        'restored_plan_code', 'free',
        'restored_plan_id', v_free_plan_id,
        'previous_tampered_plan_id', v_current_plan_id,
        'previous_tampered_period_end', v_current_period_end
      ),
      NOW()
    );

    RAISE NOTICE 'Reconciliação FIN-REC-01 concluída com sucesso para a subscrição %.', v_sub_id;
  ELSE
    RAISE NOTICE 'Subscrição % já se encontra em estado legítimo.', v_sub_id;
  END IF;
END $$;
