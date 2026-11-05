import { describe, it, expect } from 'vitest';
import { CatalogService } from '@/modules/billing/catalog-service';
import type { PlanCode, BillingCurrency, BillingInterval } from '@/lib/supabase/database.types';

describe('Phase 6 — Plans & Commercial Catalog', () => {
  const catalogService = new CatalogService();

  it('should provide the complete catalog with all 5 plans (Free, Starter, Pro, Business, Enterprise)', async () => {
    const catalog = await catalogService.getCatalog();
    expect(catalog.length).toBe(5);

    const codes = catalog.map((p) => p.code);
    expect(codes).toContain('free');
    expect(codes).toContain('starter');
    expect(codes).toContain('pro');
    expect(codes).toContain('business');
    expect(codes).toContain('enterprise');
  });

  it('should define versioned prices for all supported currencies (AOA, USD, EUR, BRL)', async () => {
    const proPlan = await catalogService.getPlanByCode('pro');
    expect(proPlan.name).toBe('Pro Plan');
    expect(proPlan.monthlyMinutesIncluded).toBe(600);

    const currencies: BillingCurrency[] = ['USD', 'EUR', 'AOA', 'BRL'];
    for (const curr of currencies) {
      const priceMonthly = await catalogService.getPlanPrice('pro', curr, 'monthly');
      expect(priceMonthly).toBeDefined();
      expect(priceMonthly.amountCents).toBeGreaterThan(0);
      expect(priceMonthly.currency).toBe(curr);
      expect(priceMonthly.version).toBe(1);
      expect(priceMonthly.isActive).toBe(true);
    }
  });

  it('should support annual billing with discounted rates', async () => {
    const starterMonthly = await catalogService.getPlanPrice('starter', 'EUR', 'monthly');
    const starterAnnual = await catalogService.getPlanPrice('starter', 'EUR', 'annual');

    expect(starterMonthly.amountCents).toBe(850); // 8.50 € / month
    expect(starterAnnual.amountCents).toBe(8500);  // 85.00 € / year (10 months instead of 12)
  });

  it('should throw an AppError when querying a non-existent plan or price', async () => {
    await expect(catalogService.getPlanByCode('unknown_plan' as PlanCode)).rejects.toThrow();
    await expect(catalogService.getPlanPrice('pro', 'USD', 'weekly' as BillingInterval)).rejects.toThrow();
  });
});
