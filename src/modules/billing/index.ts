import { z } from 'zod';
import { AppError } from '@/lib/errors/app-error';
import type { LedgerOperation, LedgerStatus } from '@/lib/supabase/database.types';

export interface QuotaReservationParams {
  organizationId: string;
  meetingId?: string;
  operation: LedgerOperation;
  estimatedQuantity: number;
  unit: string;
  idempotencyKey: string;
}

export interface QuotaSettlementParams {
  idempotencyKey: string;
  actualQuantity: number;
  costCentsUsd?: number;
}

export interface IUsageLedgerService {
  reserveQuota(params: QuotaReservationParams): Promise<{ reservationId: string; reservedQuantity: number }>;
  settleQuota(params: QuotaSettlementParams): Promise<{ ledgerId: string; settledQuantity: number }>;
  releaseQuota(idempotencyKey: string, reason?: string): Promise<void>;
  getOrganizationBalance(organizationId: string): Promise<{ usedMinutes: number; totalMinutesLimit: number; remainingMinutes: number }>;
}

export const PLAN_LIMITS = {
  free: {
    monthlyMinutes: 45,
    seatsIncluded: 1,
    priceCentsUsd: 0,
  },
  pro: {
    monthlyMinutes: 600,
    seatsIncluded: 1,
    priceCentsUsd: 1900,
  },
  business: {
    monthlyMinutes: 2500,
    seatsIncluded: 5,
    priceCentsUsd: 7900,
  },
  enterprise: {
    monthlyMinutes: 10000,
    seatsIncluded: 50,
    priceCentsUsd: 29900,
  },
} as const;

export function calculateEstimatedMinutesCost(minutes: number): number {
  // $0.0050 per minute (STT + LLM + Storage) = 0.5 cents per minute
  return Math.ceil(minutes * 0.5);
}
