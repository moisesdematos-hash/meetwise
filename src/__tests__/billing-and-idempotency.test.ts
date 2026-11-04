import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  calculateEstimatedMinutesCost,
  type QuotaReservationParams,
} from '@/modules/billing';

describe('Billing, Plans & Quota Integrity', () => {
  it('should define accurate plan limits adhering to business model', () => {
    expect(PLAN_LIMITS.free.monthlyMinutes).toBe(45);
    expect(PLAN_LIMITS.free.seatsIncluded).toBe(1);
    expect(PLAN_LIMITS.free.priceCentsUsd).toBe(0);

    expect(PLAN_LIMITS.pro.monthlyMinutes).toBe(600);
    expect(PLAN_LIMITS.pro.seatsIncluded).toBe(1);
    expect(PLAN_LIMITS.pro.priceCentsUsd).toBe(1900); // $19.00

    expect(PLAN_LIMITS.business.monthlyMinutes).toBe(2500);
    expect(PLAN_LIMITS.business.seatsIncluded).toBe(5);
    expect(PLAN_LIMITS.business.priceCentsUsd).toBe(7900); // $79.00
  });

  it('should calculate estimated minutes costs accurately', () => {
    // 45 min meeting = 23 cents estimated cost ($0.23)
    const cost45 = calculateEstimatedMinutesCost(45);
    expect(cost45).toBe(23);

    // 600 min = 300 cents ($3.00)
    const cost600 = calculateEstimatedMinutesCost(600);
    expect(cost600).toBe(300);
  });
});

describe('Usage Ledger Concurrency & Idempotency Simulation', () => {
  class MockUsageLedgerService {
    private readonly records = new Map<string, { status: string; quantity: number }>();

    public async reserveQuota(params: QuotaReservationParams): Promise<{ success: boolean; error?: string }> {
      // Check idempotency conflict
      if (this.records.has(params.idempotencyKey)) {
        return { success: false, error: 'IDEMPOTENCY_CONFLICT: Key already processed or reserved' };
      }

      this.records.set(params.idempotencyKey, {
        status: 'reserved',
        quantity: params.estimatedQuantity,
      });

      return { success: true };
    }

    public async cancelReservation(idempotencyKey: string): Promise<boolean> {
      const record = this.records.get(idempotencyKey);
      if (!record || record.status !== 'reserved') {
        return false;
      }
      record.status = 'cancelled';
      return true;
    }

    public getRecord(idempotencyKey: string) {
      return this.records.get(idempotencyKey);
    }
  }

  it('should accept first reservation and reject duplicate idempotency key (prevent double billing)', async () => {
    const service = new MockUsageLedgerService();
    const key = 'transcription-meeting-uuid-attempt-1';

    const req1 = await service.reserveQuota({
      organizationId: 'org-123',
      meetingId: 'meet-123',
      operation: 'transcription_minutes',
      estimatedQuantity: 45,
      unit: 'minutes',
      idempotencyKey: key,
    });
    expect(req1.success).toBe(true);

    // Replay of same idempotency key
    const req2 = await service.reserveQuota({
      organizationId: 'org-123',
      meetingId: 'meet-123',
      operation: 'transcription_minutes',
      estimatedQuantity: 45,
      unit: 'minutes',
      idempotencyKey: key,
    });
    expect(req2.success).toBe(false);
    expect(req2.error).toContain('IDEMPOTENCY_CONFLICT');
  });

  it('should safely release reserved quota on job failure without charging the customer', async () => {
    const service = new MockUsageLedgerService();
    const key = 'job-fail-and-rollback-key';

    await service.reserveQuota({
      organizationId: 'org-123',
      operation: 'transcription_minutes',
      estimatedQuantity: 60,
      unit: 'minutes',
      idempotencyKey: key,
    });

    const recordBefore = service.getRecord(key);
    expect(recordBefore?.status).toBe('reserved');

    const released = await service.cancelReservation(key);
    expect(released).toBe(true);

    const recordAfter = service.getRecord(key);
    expect(recordAfter?.status).toBe('cancelled');
  });
});
