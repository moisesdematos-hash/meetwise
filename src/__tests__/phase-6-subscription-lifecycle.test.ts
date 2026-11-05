import { describe, it, expect } from 'vitest';
import { SubscriptionService } from '@/modules/billing/subscription-service';

describe('Phase 6 — Subscription State Machine & Lifecycle', () => {
  const subService = new SubscriptionService();

  it('should create an active subscription and prevent duplicate active subscriptions for same org', async () => {
    const orgId = 'org-sub-cycle-1';
    const sub = await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-pro-uuid',
      planPriceId: 'price-pro-usd-m',
    });

    expect(sub.status).toBe('active');
    expect(sub.organizationId).toBe(orgId);

    // Attempt duplicate creation
    await expect(
      subService.createSubscription({
        organizationId: orgId,
        planId: 'plan-business-uuid',
        planPriceId: 'price-biz-usd-m',
      })
    ).rejects.toThrow();
  });

  it('should enforce valid state transitions and reject invalid transitions', async () => {
    const orgId = 'org-sub-cycle-2';
    const sub = await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-starter-uuid',
      planPriceId: 'price-starter-usd-m',
    });

    // Valid: active -> past_due
    const pastDue = await subService.transitionStatus(sub.id, 'past_due');
    expect(pastDue.status).toBe('past_due');

    // Valid: past_due -> grace_period
    const grace = await subService.transitionStatus(sub.id, 'grace_period');
    expect(grace.status).toBe('grace_period');
    expect(grace.gracePeriodEndsAt).toBeDefined();

    // Valid: grace_period -> suspended
    const suspended = await subService.transitionStatus(sub.id, 'suspended', 'Default payment threshold exceeded');
    expect(suspended.status).toBe('suspended');
    expect(suspended.suspendedReason).toContain('threshold exceeded');

    // Valid: suspended -> active
    const activeAgain = await subService.transitionStatus(sub.id, 'active');
    expect(activeAgain.status).toBe('active');
    expect(activeAgain.suspendedReason).toBeNull();

    // Invalid: active -> trialing (cannot go backwards to trialing)
    await expect(subService.transitionStatus(sub.id, 'trialing')).rejects.toThrow();
  });

  it('should handle cancellation at period end and reactivation', async () => {
    const orgId = 'org-sub-cycle-3';
    const sub = await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-business-uuid',
      planPriceId: 'price-biz-usd-m',
    });

    // Schedule cancel at period end
    const scheduled = await subService.cancelSubscription(sub.id, 'Switching providers', false);
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.status).toBe('active'); // Still active until period ends

    // Reactivate before period end
    const reactivated = await subService.reactivateSubscription(sub.id);
    expect(reactivated.cancelAtPeriodEnd).toBe(false);
  });
});
