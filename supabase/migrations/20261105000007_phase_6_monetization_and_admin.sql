-- ==============================================================================
-- MEETWISE AI — FASE 6: MONETIZAÇÃO, SUBSCRIÇÕES, PAGAMENTOS E ADMINISTRAÇÃO
-- Migration: 20261105000007_phase_6_monetization_and_admin.sql
-- ==============================================================================

-- 1. EXPANDIR PLANOS COMERCIAIS (Adicionar 'starter')
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_code_check 
  CHECK (code IN ('free', 'starter', 'pro', 'business', 'enterprise'));

-- Inserir Plano Starter caso não exista
INSERT INTO public.plans (name, code, monthly_minutes_included, seats_included, price_cents_usd, features)
VALUES
  ('Starter Plan', 'starter', 180, 1, 900, '{"stt": "deepgram", "minutes": true, "export": ["txt", "pdf"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 2. TABELA DE PREÇOS VERSIONADOS MULTI-MOEDA (plan_prices)
CREATE TABLE IF NOT EXISTS public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  external_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_plan_price_currency_interval_ver UNIQUE (plan_id, currency, billing_interval, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON public.plan_prices(plan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_plan_prices_currency ON public.plan_prices(currency, is_active);

-- Seed de preços de demonstração para todos os planos e moedas
DO $$
DECLARE
  v_free_id UUID;
  v_starter_id UUID;
  v_pro_id UUID;
  v_biz_id UUID;
  v_ent_id UUID;
BEGIN
  SELECT id INTO v_free_id FROM public.plans WHERE code = 'free';
  SELECT id INTO v_starter_id FROM public.plans WHERE code = 'starter';
  SELECT id INTO v_pro_id FROM public.plans WHERE code = 'pro';
  SELECT id INTO v_biz_id FROM public.plans WHERE code = 'business';
  SELECT id INTO v_ent_id FROM public.plans WHERE code = 'enterprise';

  -- Preços Gratuitos (0 em todas as moedas)
  IF v_free_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_free_id, 'USD', 0, 'monthly'), (v_free_id, 'EUR', 0, 'monthly'),
      (v_free_id, 'AOA', 0, 'monthly'), (v_free_id, 'BRL', 0, 'monthly')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Starter ($9 USD / €8.50 EUR / 8,000 AOA / R$ 49 BRL)
  IF v_starter_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_starter_id, 'USD', 900, 'monthly'), (v_starter_id, 'EUR', 850, 'monthly'),
      (v_starter_id, 'AOA', 800000, 'monthly'), (v_starter_id, 'BRL', 4900, 'monthly'),
      (v_starter_id, 'USD', 9000, 'annual'), (v_starter_id, 'EUR', 8500, 'annual'),
      (v_starter_id, 'AOA', 8000000, 'annual'), (v_starter_id, 'BRL', 49000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Pro ($19 USD / €18 EUR / 16,500 AOA / R$ 99 BRL)
  IF v_pro_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_pro_id, 'USD', 1900, 'monthly'), (v_pro_id, 'EUR', 1800, 'monthly'),
      (v_pro_id, 'AOA', 1650000, 'monthly'), (v_pro_id, 'BRL', 9900, 'monthly'),
      (v_pro_id, 'USD', 19000, 'annual'), (v_pro_id, 'EUR', 18000, 'annual'),
      (v_pro_id, 'AOA', 16500000, 'annual'), (v_pro_id, 'BRL', 99000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Business ($79 USD / €75 EUR / 68,000 AOA / R$ 399 BRL)
  IF v_biz_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_biz_id, 'USD', 7900, 'monthly'), (v_biz_id, 'EUR', 7500, 'monthly'),
      (v_biz_id, 'AOA', 6800000, 'monthly'), (v_biz_id, 'BRL', 39900, 'monthly'),
      (v_biz_id, 'USD', 79000, 'annual'), (v_biz_id, 'EUR', 75000, 'annual'),
      (v_biz_id, 'AOA', 68000000, 'annual'), (v_biz_id, 'BRL', 399000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Enterprise ($299 USD / €280 EUR / 260,000 AOA / R$ 1,499 BRL)
  IF v_ent_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_ent_id, 'USD', 29900, 'monthly'), (v_ent_id, 'EUR', 28000, 'monthly'),
      (v_ent_id, 'AOA', 26000000, 'monthly'), (v_ent_id, 'BRL', 149900, 'monthly')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;
END $$;

-- 3. EVOLUÇÃO DA TABELA SUBSCRIPTIONS
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'canceled', 'unpaid', 'expired'));

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_price_id UUID REFERENCES public.plan_prices(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS external_subscription_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mock';

-- 4. TABELA DE INTENÇÕES DE CHECKOUT SEGURO (checkout_sessions)
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  plan_price_id UUID NOT NULL REFERENCES public.plan_prices(id),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mock', 'multicaixa', 'paypal')),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired', 'failed')),
  session_reference TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT,
  provider_url TEXT,
  success_url TEXT NOT NULL,
  cancel_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_org ON public.checkout_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_checkout_ref ON public.checkout_sessions(session_reference);

-- 5. TABELA DE FATURAS E DOCUMENTOS FINANCEIROS (invoices)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'paid', 'void', 'refunded')),
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  billing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 6. ITENS DE FATURA (invoice_lines)
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv ON public.invoice_lines(invoice_id);

-- 7. TABELA DO LEDGER FINANCEIRO (DOUBLE-ENTRY) (financial_ledger_entries)
CREATE TABLE IF NOT EXISTS public.financial_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'accounts_receivable', 'revenue', 'cash', 
      'deferred_revenue', 'refund_expense', 'bad_debt', 'ai_cost_expense'
    )
  ),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('invoice', 'payment', 'refund', 'ai_usage', 'manual_adjustment')),
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_ledger_org ON public.financial_ledger_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_tx ON public.financial_ledger_entries(transaction_id);

-- 8. TABELA DE REEMBOLSOS (refunds)
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_event_id UUID REFERENCES public.payment_events(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'failed', 'rejected')),
  external_refund_id TEXT,
  processed_by UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_org ON public.refunds(organization_id);

-- 9. TABELA DE ADMINISTRADORES DA PLATAFORMA (platform_admins)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'billing_admin', 'support_admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. RESERVAS ATÓMICAS DE QUOTA (organization_quota_reserves)
CREATE TABLE IF NOT EXISTS public.organization_quota_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  reserved_quantity NUMERIC(10,2) NOT NULL CHECK (reserved_quantity > 0),
  unit TEXT NOT NULL DEFAULT 'minutes',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quota_reserves_org ON public.organization_quota_reserves(organization_id, status);

-- 11. FUNÇÃO ATÓMICA DE SEQUÊNCIA DE FATURAS
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_org_id UUID, p_year INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seq INTEGER;
  v_num TEXT;
BEGIN
  -- Reutiliza organization_document_sequences com prefixo 'FAT'
  INSERT INTO public.organization_document_sequences (organization_id, year, prefix, last_number)
  VALUES (p_org_id, p_year, 'FAT', 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET
    last_number = organization_document_sequences.last_number + 1,
    updated_at = NOW()
  RETURNING last_number INTO v_seq;

  v_num := 'FAT-' || p_year || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_num;
END;
$$;

-- 12. HABILITAR ROW LEVEL SECURITY (RLS) & GRANTS
GRANT SELECT ON public.plan_prices TO authenticated, anon;
GRANT ALL ON public.checkout_sessions TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoice_lines TO authenticated;
GRANT ALL ON public.financial_ledger_entries TO authenticated;
GRANT ALL ON public.refunds TO authenticated;
GRANT ALL ON public.platform_admins TO authenticated;
GRANT ALL ON public.organization_quota_reserves TO authenticated;

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_quota_reserves ENABLE ROW LEVEL SECURITY;

-- 13. POLÍTICAS RLS

-- A) Plan Prices: Leitura pública para ativos
CREATE POLICY "plan_prices_select" ON public.plan_prices
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- B) Checkout Sessions: Membros da organização podem criar e consultar suas sessões
CREATE POLICY "checkout_sessions_select" ON public.checkout_sessions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "checkout_sessions_insert" ON public.checkout_sessions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- C) Invoices & Lines: Leitura por membros, criação/gestão por owners/admins
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "invoices_manage_admin" ON public.invoices
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

CREATE POLICY "invoice_lines_select" ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices WHERE organization_id IN (SELECT org_id FROM public.current_user_org_ids())
  ));

-- D) Financial Ledger: Consulta restrita a gestores financeiros da organização
CREATE POLICY "fin_ledger_select" ON public.financial_ledger_entries
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- E) Refunds: Visível apenas a administradores da organização
CREATE POLICY "refunds_select" ON public.refunds
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- F) Quota Reserves: Visível a membros da organização
CREATE POLICY "quota_reserves_select" ON public.organization_quota_reserves
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- G) Platform Admins: Apenas utilizadores autenticados podem verificar seu próprio estatuto
CREATE POLICY "platform_admins_select_self" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Triggers anti-tamper
CREATE TRIGGER trg_tamper_checkout BEFORE UPDATE ON public.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

CREATE TRIGGER trg_tamper_invoices BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

CREATE TRIGGER trg_tamper_refunds BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

CREATE TRIGGER trg_tamper_quota_reserves BEFORE UPDATE ON public.organization_quota_reserves
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

-- Imutabilidade do Ledger Financeiro (Proibição estrita de UPDATE e DELETE)
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Modifications or deletions to financial ledger entries are forbidden';
END;
$$;

CREATE TRIGGER trigger_financial_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON public.financial_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_ledger_tampering();

-- Imutabilidade dos Eventos de Pagamento (Proibição estrita de DELETE)
CREATE OR REPLACE FUNCTION public.fn_prevent_payment_events_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Deletions of payment events are forbidden';
END;
$$;

CREATE TRIGGER trigger_payment_events_no_delete
BEFORE DELETE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_payment_events_deletion();
