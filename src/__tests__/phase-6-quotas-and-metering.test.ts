import { describe, it, expect } from 'vitest';
import { QuotaService } from '@/modules/billing/quota-service';
import { SubscriptionService } from '@/modules/billing/subscription-service';

describe('Phase 6 — Quotas, Entitlements & Metering Engine', () => {
  const subService = new SubscriptionService();
  const quotaService = new QuotaService(undefined, subService);
  const orgId = 'org-quota-test-uuid';

  it('should verify entitlements according to plan features', async () => {
    // Free plan: txt only, no diarization
    const hasDiarizationFree = await quotaService.checkEntitlement(orgId, 'diarization');
    expect(hasDiarizationFree).toBe(false);

    // Create Business subscription: has diarization
    await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-business-uuid',
      planPriceId: 'price-biz-usd-m',
    });

    const hasDiarizationBiz = await quotaService.checkEntitlement(orgId, 'diarization');
    expect(hasDiarizationBiz).toBe(true);
  });

  it('should atomically reserve quota and prevent concurrent over-consumption', async () => {
    const limits = await quotaService.getOrganizationPlanLimits(orgId);
    expect(limits.monthlyMinutes).toBe(2500);

    const idempotencyKey1 = 'res-job-attempt-1';
    const res1 = await quotaService.reserveMinutes({
      organizationId: orgId,
      minutes: 1000,
      idempotencyKey: idempotencyKey1,
    });
    expect(res1.reserved).toBe(true);
    expect(res1.remainingMinutes).toBe(1500);

    // Duplicate reservation with same idempotency key returns same reservation (idempotency)
    const replay = await quotaService.reserveMinutes({
      organizationId: orgId,
      minutes: 1000,
      idempotencyKey: idempotencyKey1,
    });
    expect(replay.reserved).toBe(true);
    expect(replay.reservationId).toBe(res1.reservationId);

    // Second reservation consumes remaining quota
    const idempotencyKey2 = 'res-job-attempt-2';
    const res2 = await quotaService.reserveMinutes({
      organizationId: orgId,
      minutes: 1500,
      idempotencyKey: idempotencyKey2,
    });
    expect(res2.remainingMinutes).toBe(0);

    // Third reservation exceeds quota and is rejected with QUOTA_EXCEEDED (429)
    await expect(
      quotaService.reserveMinutes({
        organizationId: orgId,
        minutes: 10,
        idempotencyKey: 'res-job-attempt-3',
      })
    ).rejects.toThrow();
  });

  it('should settle reserved minutes or release them on job failure', async () => {
    const settleOrgId = 'org-settle-test-uuid';
    await subService.createSubscription({
      organizationId: settleOrgId,
      planId: 'plan-pro-uuid',
      planPriceId: 'price-pro-usd-m',
    });

    const key = 'settle-and-release-test-key';
    await quotaService.reserveMinutes({
      organizationId: settleOrgId,
      minutes: 50,
      idempotencyKey: key,
    });

    // Settle 45 actual minutes
    const settleRes = await quotaService.settleMinutes({
      idempotencyKey: key,
      actualMinutes: 45,
    });
    expect(settleRes.settled).toBe(true);
    expect(settleRes.settledMinutes).toBe(45);

    // Release another reservation
    const failKey = 'failed-job-key-1';
    await quotaService.reserveMinutes({
      organizationId: settleOrgId,
      minutes: 100,
      idempotencyKey: failKey,
    });
    await quotaService.releaseMinutes({ idempotencyKey: failKey, reason: 'Worker crashed' });
  });
});
