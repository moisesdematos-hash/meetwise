import { describe, it, expect } from 'vitest';
import { CheckoutService } from '@/modules/billing/checkout-service';

describe('Phase 6 — Checkout Engine & Anti-Tamper Security', () => {
  const checkoutService = new CheckoutService();

  it('should create a secure checkout session with server-resolved pricing', async () => {
    const session = await checkoutService.createSession({
      organizationId: 'org-test-uuid',
      userId: 'user-test-uuid',
      planCode: 'pro',
      currency: 'EUR',
      interval: 'monthly',
      provider: 'mock',
      successUrl: 'https://app.meetwise.ai/billing?success=true',
      cancelUrl: 'https://app.meetwise.ai/billing?cancel=true',
    });

    expect(session).toBeDefined();
    expect(session.sessionReference).toMatch(/^cs_ref_/);
    expect(session.amountCents).toBe(1800); // 18,00 EUR resolved by server
    expect(session.status).toBe('open');
    expect(session.providerUrl).toContain(session.sessionReference);

    // Verify 30-minute expiration
    const expiry = new Date(session.expiresAt).getTime();
    const now = Date.now();
    expect(expiry - now).toBeGreaterThan(25 * 60 * 1000);
    expect(expiry - now).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);
  });

  it('should reject currency not supported by the payment provider', async () => {
    await expect(
      checkoutService.createSession({
        organizationId: 'org-test-uuid',
        userId: 'user-test-uuid',
        planCode: 'starter',
        currency: 'AOA', // Stripe does not support native AOA payouts
        interval: 'monthly',
        provider: 'stripe',
        successUrl: 'https://app.meetwise.ai/success',
        cancelUrl: 'https://app.meetwise.ai/cancel',
      })
    ).rejects.toThrow();
  });

  it('should allow expiring open checkout sessions', async () => {
    const session = await checkoutService.createSession({
      organizationId: 'org-test-uuid',
      userId: 'user-test-uuid',
      planCode: 'starter',
      currency: 'USD',
      interval: 'monthly',
      provider: 'mock',
      successUrl: 'https://app.meetwise.ai/success',
      cancelUrl: 'https://app.meetwise.ai/cancel',
    });

    await checkoutService.expireSession(session.sessionReference);
    const expired = await checkoutService.getSession(session.sessionReference);
    expect(expired?.status).toBe('expired');
  });
});
