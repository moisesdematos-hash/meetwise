-- ==============================================================================
-- MEETWISE AI — NON-DESTRUCTIVE RECOVERY PLAN FOR MIGRATION 009
-- Target: Supabase Cloud Staging (ycxwomqqepetickmxxqj)
-- Scope: Reverts triggers and restores policies to Migration 007/008 baseline
-- ==============================================================================

-- 1. DROP PROTECTIVE TRIGGERS
DROP TRIGGER IF EXISTS trg_protect_invoice_fields ON public.invoices;
DROP FUNCTION IF EXISTS public.protect_invoice_financial_fields();

DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
DROP FUNCTION IF EXISTS public.protect_subscription_financial_fields();

DROP TRIGGER IF EXISTS trg_audit_log_integrity ON public.audit_logs;
DROP FUNCTION IF EXISTS public.protect_audit_log_integrity();

-- 2. RESTORE POLICIES TO PHASE 6 BASELINE (Migration 007)
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;
CREATE POLICY "invoices_manage_admin" ON public.invoices
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "subscriptions_update_owner" ON public.subscriptions;
CREATE POLICY "subscriptions_manage_owner" ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_delete" ON public.audit_logs;

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 3. REMOVE MIGRATION RECORD
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261106000009';
