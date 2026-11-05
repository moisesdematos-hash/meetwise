import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PlanCode, BillingCurrency, BillingInterval } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { IBillingService, CommercialPlan, PlanPriceItem, PlanFeatureSet } from './types';

export class CatalogService implements IBillingService {
  constructor(private readonly supabase?: SupabaseClient<Database>) {}

  // Static in-memory catalog representing the default seed with versioned prices
  private static readonly IN_MEMORY_PLANS: CommercialPlan[] = [
    {
      id: 'plan-free-uuid',
      name: 'Free Plan',
      code: 'free',
      monthlyMinutesIncluded: 45,
      seatsIncluded: 1,
      isActive: true,
      features: {
        stt: 'basic',
        minutes: true,
        export: ['txt'],
        max_file_size_mb: 50,
      },
      prices: [
        { id: 'price-free-usd', planId: 'plan-free-uuid', currency: 'USD', amountCents: 0, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-free-eur', planId: 'plan-free-uuid', currency: 'EUR', amountCents: 0, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-free-aoa', planId: 'plan-free-uuid', currency: 'AOA', amountCents: 0, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-free-brl', planId: 'plan-free-uuid', currency: 'BRL', amountCents: 0, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
      ],
    },
    {
      id: 'plan-starter-uuid',
      name: 'Starter Plan',
      code: 'starter',
      monthlyMinutesIncluded: 180,
      seatsIncluded: 1,
      isActive: true,
      features: {
        stt: 'deepgram',
        minutes: true,
        export: ['txt', 'pdf'],
        max_file_size_mb: 150,
      },
      prices: [
        { id: 'price-starter-usd-m', planId: 'plan-starter-uuid', currency: 'USD', amountCents: 900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-eur-m', planId: 'plan-starter-uuid', currency: 'EUR', amountCents: 850, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-aoa-m', planId: 'plan-starter-uuid', currency: 'AOA', amountCents: 800000, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-brl-m', planId: 'plan-starter-uuid', currency: 'BRL', amountCents: 4900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-usd-a', planId: 'plan-starter-uuid', currency: 'USD', amountCents: 9000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-eur-a', planId: 'plan-starter-uuid', currency: 'EUR', amountCents: 8500, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-aoa-a', planId: 'plan-starter-uuid', currency: 'AOA', amountCents: 8000000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-starter-brl-a', planId: 'plan-starter-uuid', currency: 'BRL', amountCents: 49000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
      ],
    },
    {
      id: 'plan-pro-uuid',
      name: 'Pro Plan',
      code: 'pro',
      monthlyMinutesIncluded: 600,
      seatsIncluded: 1,
      isActive: true,
      features: {
        stt: 'deepgram',
        minutes: true,
        chat: true,
        export: ['txt', 'pdf', 'docx'],
        max_file_size_mb: 500,
      },
      prices: [
        { id: 'price-pro-usd-m', planId: 'plan-pro-uuid', currency: 'USD', amountCents: 1900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-eur-m', planId: 'plan-pro-uuid', currency: 'EUR', amountCents: 1800, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-aoa-m', planId: 'plan-pro-uuid', currency: 'AOA', amountCents: 1650000, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-brl-m', planId: 'plan-pro-uuid', currency: 'BRL', amountCents: 9900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-usd-a', planId: 'plan-pro-uuid', currency: 'USD', amountCents: 19000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-eur-a', planId: 'plan-pro-uuid', currency: 'EUR', amountCents: 18000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-aoa-a', planId: 'plan-pro-uuid', currency: 'AOA', amountCents: 16500000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-pro-brl-a', planId: 'plan-pro-uuid', currency: 'BRL', amountCents: 99000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
      ],
    },
    {
      id: 'plan-business-uuid',
      name: 'Business Plan',
      code: 'business',
      monthlyMinutesIncluded: 2500,
      seatsIncluded: 5,
      isActive: true,
      features: {
        stt: 'deepgram',
        diarization: true,
        minutes: true,
        chat: true,
        team_sharing: true,
        export: ['txt', 'pdf', 'docx'],
        max_file_size_mb: 500,
      },
      prices: [
        { id: 'price-biz-usd-m', planId: 'plan-business-uuid', currency: 'USD', amountCents: 7900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-eur-m', planId: 'plan-business-uuid', currency: 'EUR', amountCents: 7500, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-aoa-m', planId: 'plan-business-uuid', currency: 'AOA', amountCents: 6800000, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-brl-m', planId: 'plan-business-uuid', currency: 'BRL', amountCents: 39900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-usd-a', planId: 'plan-business-uuid', currency: 'USD', amountCents: 79000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-eur-a', planId: 'plan-business-uuid', currency: 'EUR', amountCents: 75000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-aoa-a', planId: 'plan-business-uuid', currency: 'AOA', amountCents: 68000000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-biz-brl-a', planId: 'plan-business-uuid', currency: 'BRL', amountCents: 399000, billingInterval: 'annual', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
      ],
    },
    {
      id: 'plan-enterprise-uuid',
      name: 'Enterprise Plan',
      code: 'enterprise',
      monthlyMinutesIncluded: 10000,
      seatsIncluded: 50,
      isActive: true,
      features: {
        stt: 'premium',
        diarization: true,
        minutes: true,
        chat: true,
        team_sharing: true,
        custom_retention: true,
        sla: true,
        export: ['txt', 'pdf', 'docx'],
        max_file_size_mb: 2000,
      },
      prices: [
        { id: 'price-ent-usd-m', planId: 'plan-enterprise-uuid', currency: 'USD', amountCents: 29900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-ent-eur-m', planId: 'plan-enterprise-uuid', currency: 'EUR', amountCents: 28000, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-ent-aoa-m', planId: 'plan-enterprise-uuid', currency: 'AOA', amountCents: 26000000, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
        { id: 'price-ent-brl-m', planId: 'plan-enterprise-uuid', currency: 'BRL', amountCents: 149900, billingInterval: 'monthly', version: 1, isActive: true, effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: null, externalPriceId: null },
      ],
    },
  ];

  public async getCatalog(filterCurrency?: BillingCurrency): Promise<CommercialPlan[]> {
    if (!this.supabase) {
      return this.filterCatalog(CatalogService.IN_MEMORY_PLANS, filterCurrency);
    }

    try {
      const { data: plansData, error: plansError } = await this.supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('monthly_minutes_included', { ascending: true });

      if (plansError || !plansData || plansData.length === 0) {
        return this.filterCatalog(CatalogService.IN_MEMORY_PLANS, filterCurrency);
      }

      const { data: pricesData } = await this.supabase
        .from('plan_prices')
        .select('*')
        .eq('is_active', true);

      const result: CommercialPlan[] = plansData.map((plan) => {
        const matchingPrices: PlanPriceItem[] = (pricesData || [])
          .filter((p) => p.plan_id === plan.id)
          .map((p) => ({
            id: p.id,
            planId: p.plan_id,
            currency: p.currency,
            amountCents: p.amount_cents,
            billingInterval: p.billing_interval,
            version: p.version,
            isActive: p.is_active,
            effectiveFrom: p.effective_from,
            effectiveUntil: p.effective_until,
            externalPriceId: p.external_price_id,
          }));

        return {
          id: plan.id,
          name: plan.name,
          code: plan.code,
          monthlyMinutesIncluded: plan.monthly_minutes_included,
          seatsIncluded: plan.seats_included,
          isActive: plan.is_active,
          features: (plan.features || {}) as unknown as PlanFeatureSet,
          prices: matchingPrices.length > 0
            ? matchingPrices
            : (CatalogService.IN_MEMORY_PLANS.find((p) => p.code === plan.code)?.prices || []),
        };
      });

      return this.filterCatalog(result, filterCurrency);
    } catch {
      return this.filterCatalog(CatalogService.IN_MEMORY_PLANS, filterCurrency);
    }
  }

  public async getPlanByCode(code: PlanCode): Promise<CommercialPlan> {
    const catalog = await this.getCatalog();
    const found = catalog.find((p) => p.code === code);
    if (!found) {
      throw new AppError({
        code: 'PLAN_NOT_FOUND',
        message: `Plan with code '${code}' not found in catalog.`,
        statusCode: 404,
      });
    }
    return found;
  }

  public async getPlanPrice(
    planId: string,
    currency: BillingCurrency,
    interval: BillingInterval
  ): Promise<PlanPriceItem> {
    const catalog = await this.getCatalog();
    for (const plan of catalog) {
      if (plan.id === planId || plan.code === (planId as PlanCode)) {
        const price = plan.prices.find(
          (p) => p.currency === currency && p.billingInterval === interval && p.isActive
        );
        if (price) return price;
      }
    }

    throw new AppError({
      code: 'PRICE_NOT_FOUND',
      message: `No active price found for plan '${planId}' in '${currency}' with interval '${interval}'.`,
      statusCode: 404,
    });
  }

  private filterCatalog(plans: CommercialPlan[], currency?: BillingCurrency): CommercialPlan[] {
    if (!currency) return plans;
    return plans.map((p) => ({
      ...p,
      prices: p.prices.filter((pr) => pr.currency === currency),
    }));
  }
}
