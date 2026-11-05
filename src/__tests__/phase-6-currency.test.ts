import { describe, it, expect } from 'vitest';
import { CurrencyService } from '@/modules/billing/currency-service';

describe('Phase 6 — Multi-Currency & Financial Precision', () => {
  it('should format amounts correctly per jurisdiction and currency standards', () => {
    // AOA
    const aoaStr = CurrencyService.format(1650000, 'AOA'); // 16,500.00 Kz
    expect(aoaStr).toContain('Kz');
    expect(aoaStr).toContain('16');

    // EUR
    const eurStr = CurrencyService.format(1800, 'EUR'); // 18,00 €
    expect(eurStr).toContain('€');
    expect(eurStr).toContain('18');

    // USD
    const usdStr = CurrencyService.format(1900, 'USD'); // $19.00
    expect(usdStr).toBe('$19.00');

    // BRL
    const brlStr = CurrencyService.format(9900, 'BRL'); // R$ 99,00
    expect(brlStr).toContain('R$');
  });

  it('should convert amounts between currencies using tracked demonstration rates', () => {
    const res = CurrencyService.convert(10000, 'USD', 'EUR'); // $100.00 to EUR
    expect(res.convertedCents).toBe(9400); // €94.00
    expect(res.rateUsed).toBe(0.94);
    expect(res.isDemonstration).toBe(true);
    expect(res.source).toBe('MEETWISE_DEMO_BENCHMARK_RATES');
  });

  it('should maintain exact integer cents without floating point drift', () => {
    const res = CurrencyService.convert(1900, 'USD', 'AOA');
    expect(Number.isInteger(res.convertedCents)).toBe(true);
    expect(res.convertedCents).toBeGreaterThan(0);
  });

  it('should reject negative amounts in conversion', () => {
    expect(() => CurrencyService.convert(-500, 'USD', 'EUR')).toThrow();
  });
});
