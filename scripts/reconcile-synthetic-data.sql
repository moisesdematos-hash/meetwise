-- ==============================================================================
-- MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.C.2
-- RECONCILIAÇÃO CONTROLADA DE REGISTOS SINTÉTICOS ADULTERADOS EM D1.A
-- Target: Supabase Cloud Staging (ycxwomqqepetickmxxqj)
-- Context: Reverte as manipulações sintéticas executadas na prova de conceito D1.A
--          mantendo evidências forenses e restabelecendo o estado Free Tier / Não Pago.
-- ==============================================================================

-- 1. REVERTER FATURAS SINTÉTICAS DE ALPHA PARA STATUS ISSUED E VALOR REAL
UPDATE public.invoices
SET status = 'issued',
    total_cents = 1900,
    subtotal_cents = 1900,
    tax_cents = 0,
    payment_reference = NULL,
    paid_at = NULL,
    billing_details = jsonb_set(
      COALESCE(billing_details, '{}'::jsonb),
      '{reconciliation}',
      '{"status": "reverted_to_issued", "phase": "D1.C.2", "timestamp": "2026-11-06T09:00:00Z"}'::jsonb
    )
WHERE organization_id = '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc'
  AND invoice_number LIKE 'INV-D1A-%';

-- 2. REVERTER SUBSCRIÇÃO DA ORGANIZAÇÃO ALPHA PARA PLANO FREE E VIGÊNCIA DE 30 DIAS
UPDATE public.subscriptions
SET plan_id = (SELECT id FROM public.plans WHERE code = 'free'),
    current_period_start = NOW(),
    current_period_end = NOW() + INTERVAL '30 days',
    cancel_at_period_end = false,
    status = 'active'
WHERE organization_id = '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc';

-- 3. LIBERTAR EVENTUAIS RESERVAS ATIVAS DE QUOTA PARA A ORGANIZAÇÃO ALPHA
UPDATE public.organization_quota_reserves
SET status = 'released'
WHERE organization_id = '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc'
  AND status = 'active';

-- 4. REGISTO COMPENSATÓRIO NO AUDIT LOG (PRESERVAÇÃO FORENSE)
INSERT INTO public.audit_logs (organization_id, action, resource_type, resource_id, metadata, created_at)
VALUES (
  '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc',
  'security.reconciliation_applied',
  'reconciliation',
  '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc',
  jsonb_build_object(
    'phase', 'D1.C.2',
    'remediated_vulnerabilities', jsonb_build_array('VULN-001', 'VULN-002', 'VULN-003'),
    'invoices_reconciled', (SELECT count(*) FROM public.invoices WHERE organization_id = '3f737a15-22e9-48d1-b7d9-7ae806a2d3fc' AND invoice_number LIKE 'INV-D1A-%'),
    'subscription_plan_restored', 'free',
    'audit_evidence_preserved', true,
    'timestamp', NOW()
  ),
  NOW()
);
