import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, LedgerOperation, LedgerStatus } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import {
  PLAN_LIMITS,
  calculateEstimatedMinutesCost,
  type IQuotaService,
  type IEntitlementService,
  type IUsageMeteringService,
  type IUsageLedgerService,
  type QuotaReservationParams,
  type QuotaSettlementParams,
  type PlanFeatureSet,
  type ISubscriptionService,
  type IBillingService,
} from './types';
import { SubscriptionService } from './subscription-service';
import { CatalogService } from './catalog-service';

export class QuotaService implements IQuotaService, IEntitlementService, IUsageMeteringService, IUsageLedgerService {
  private readonly subscriptionService: ISubscriptionService;
  private readonly catalogService: IBillingService;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    subscriptionService?: ISubscriptionService,
    catalogService?: IBillingService
  ) {
    this.subscriptionService = subscriptionService || new SubscriptionService(supabase);
    this.catalogService = catalogService || new CatalogService(supabase);
  }

  // In-memory reserves and ledger for fast tests
  private static readonly IN_MEMORY_RESERVES = new Map<
    string,
    { id: string; organizationId: string; quantity: number; status: 'active' | 'settled' | 'released'; expiresAt: number }
  >();
  private static readonly IN_MEMORY_SETTLED = new Map<
    string,
    { id: string; organizationId: string; operation: LedgerOperation; quantity: number; status: LedgerStatus }
  >();

  // ==========================================================================
  // IEntitlementService
  // ==========================================================================

  public async getOrganizationPlanLimits(organizationId: string): Promise<{
    monthlyMinutes: number;
    seats: number;
    features: PlanFeatureSet;
  }> {
    const sub = await this.subscriptionService.getSubscription(organizationId);
    let planCode = (sub?.planId as any) || 'free';

    // If planId is UUID, look up plan code
    if (sub && sub.planId.startsWith('plan-') || sub?.planId.includes('-')) {
      try {
        const catalog = await this.catalogService.getCatalog();
        const found = catalog.find((p) => p.id === sub.planId);
        if (found) planCode = found.code;
      } catch {
        planCode = 'free';
      }
    }

    const plan = await this.catalogService.getPlanByCode(planCode in PLAN_LIMITS ? planCode : 'free');
    return {
      monthlyMinutes: plan.monthlyMinutesIncluded,
      seats: plan.seatsIncluded,
      features: plan.features,
    };
  }

  public async checkEntitlement(organizationId: string, featureKey: keyof PlanFeatureSet): Promise<boolean> {
    const limits = await this.getOrganizationPlanLimits(organizationId);
    return Boolean(limits.features[featureKey]);
  }

  // ==========================================================================
  // IQuotaService
  // ==========================================================================

  public async checkQuotaAvailability(
    organizationId: string,
    requestedMinutes: number
  ): Promise<{ available: boolean; remainingMinutes: number }> {
    const limits = await this.getOrganizationPlanLimits(organizationId);
    const balance = await this.getOrganizationBalance(organizationId);
    const available = balance.remainingMinutes >= requestedMinutes;
    return { available, remainingMinutes: balance.remainingMinutes };
  }

  public async reserveMinutes(params: {
    organizationId: string;
    minutes: number;
    idempotencyKey: string;
  }): Promise<{ reserved: boolean; reservationId: string; remainingMinutes: number }> {
    // 0. Primary Path: Database Atomic Transactional RPC (PostgreSQL Lock + Check + Insert)
    if (this.supabase) {
      let data: any;
      let error: any;

      try {
        const response = await (this.supabase as any).rpc('reserve_organization_quota', {
          p_organization_id: params.organizationId,
          p_minutes: params.minutes,
          p_idempotency_key: params.idempotencyKey,
          p_operation: 'transcription_minutes',
          p_ttl_seconds: 3600,
        });
        data = response.data;
        error = response.error;
      } catch (err: any) {
        // Strict Fail-Closed: Never silently fallback to memory on database connection/driver failure
        throw new AppError({
          code: 'DATABASE_UNAVAILABLE',
          message: `Database quota reservation failed: ${err?.message || 'Connection failure'}`,
          statusCode: 503,
        });
      }

      if (error) {
        if (error.message.includes('Quota Exceeded')) {
          throw new AppError({
            code: 'QUOTA_EXCEEDED',
            message: error.message,
            statusCode: 429,
          });
        }
        if (error.message.includes('Idempotency Conflict')) {
          throw new AppError({
            code: 'IDEMPOTENCY_CONFLICT',
            message: error.message,
            statusCode: 409,
          });
        }
        if (error.message.includes('Subscription Inactive')) {
          throw new AppError({
            code: 'SUBSCRIPTION_INACTIVE',
            message: error.message,
            statusCode: 403,
          });
        }
        if (error.message.includes('Security Violation')) {
          throw new AppError({
            code: 'UNAUTHORIZED',
            message: error.message,
            statusCode: 403,
          });
        }

        // Strict Fail-Closed: Any other DB error rejects the operation; never fallback to memory
        throw new AppError({
          code: 'DATABASE_ERROR',
          message: `Database error during quota reservation: ${error.message}`,
          statusCode: 500,
        });
      }

      if (!data || (data as any[]).length === 0) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          message: 'Database did not return a valid reservation record.',
          statusCode: 500,
        });
      }

      const row = (data as any[])[0];
      return {
        reserved: true,
        reservationId: row.reservation_id,
        remainingMinutes: Number(row.remaining_minutes),
      };
    }

    // 1. In-Memory Mock: STRICTLY restricted to unit test environments without a database client
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError({
        code: 'CONFIGURATION_ERROR',
        message: 'Database client is strictly required for quota management in non-test environments.',
        statusCode: 500,
      });
    }

    // In-Memory Fallback Path (Unit Test Mocking Only)
    const existing = QuotaService.IN_MEMORY_RESERVES.get(params.idempotencyKey);
    if (existing) {
      if (existing.status === 'active') {
        const balance = await this.getOrganizationBalance(params.organizationId);
        return { reserved: true, reservationId: existing.id, remainingMinutes: balance.remainingMinutes };
      } else {
        throw new AppError({
          code: 'IDEMPOTENCY_CONFLICT',
          message: `Idempotency key '${params.idempotencyKey}' was already processed with status '${existing.status}'.`,
          statusCode: 409,
        });
      }
    }

    const sub = await this.subscriptionService.getSubscription(params.organizationId);
    if (sub && ['suspended', 'expired', 'cancelled'].includes(sub.status)) {
      throw new AppError({
        code: 'SUBSCRIPTION_INACTIVE',
        message: `Cannot reserve quota: subscription is currently '${sub.status}'.`,
        statusCode: 403,
      });
    }

    const balance = await this.getOrganizationBalance(params.organizationId);
    if (balance.remainingMinutes < params.minutes) {
      throw new AppError({
        code: 'QUOTA_EXCEEDED',
        message: `Requested ${params.minutes} minutes, but only ${balance.remainingMinutes} minutes remain in active cycle.`,
        statusCode: 429,
        details: { requested: params.minutes, remaining: balance.remainingMinutes },
      });
    }

    const reservationId = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000;

    QuotaService.IN_MEMORY_RESERVES.set(params.idempotencyKey, {
      id: reservationId,
      organizationId: params.organizationId,
      quantity: params.minutes,
      status: 'active',
      expiresAt,
    });

    return {
      reserved: true,
      reservationId,
      remainingMinutes: balance.remainingMinutes - params.minutes,
    };
  }

  public async settleMinutes(params: {
    idempotencyKey: string;
    actualMinutes: number;
    meetingId?: string;
    reservationId?: string;
  }): Promise<{ settled: boolean; settledMinutes: number }> {
    if (this.supabase) {
      try {
        const { data, error } = await (this.supabase as any).rpc('settle_organization_quota', {
          p_reservation_id: params.reservationId || crypto.randomUUID(),
          p_actual_minutes: params.actualMinutes,
          p_meeting_id: params.meetingId || null,
          p_idempotency_key: params.idempotencyKey,
        });

        if (error) {
          throw new AppError({
            code: 'DATABASE_ERROR',
            message: `Database error settling quota reservation: ${error.message}`,
            statusCode: 500,
          });
        }

        return { settled: true, settledMinutes: params.actualMinutes };
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError({
          code: 'DATABASE_UNAVAILABLE',
          message: `Database quota settlement failed: ${err?.message || 'Connection failure'}`,
          statusCode: 503,
        });
      }
    }

    // In-Memory Fallback strictly restricted to test mode
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError({
        code: 'CONFIGURATION_ERROR',
        message: 'Database client is strictly required for quota management in non-test environments.',
        statusCode: 500,
      });
    }

    const reserve = QuotaService.IN_MEMORY_RESERVES.get(params.idempotencyKey);
    if (!reserve) {
      return { settled: true, settledMinutes: params.actualMinutes };
    }

    reserve.status = 'settled';

    const ledgerId = crypto.randomUUID();
    QuotaService.IN_MEMORY_SETTLED.set(params.idempotencyKey, {
      id: ledgerId,
      organizationId: reserve.organizationId,
      operation: 'transcription_minutes',
      quantity: params.actualMinutes,
      status: 'settled',
    });

    return { settled: true, settledMinutes: params.actualMinutes };
  }

  public async releaseMinutes(params: {
    idempotencyKey: string;
    reservationId?: string;
    reason?: string;
  }): Promise<void> {
    if (this.supabase) {
      try {
        const { error } = await (this.supabase as any).rpc('release_organization_quota', {
          p_reservation_id: params.reservationId || crypto.randomUUID(),
          p_idempotency_key: params.idempotencyKey,
        });

        if (error) {
          throw new AppError({
            code: 'DATABASE_ERROR',
            message: `Database error releasing quota reservation: ${error.message}`,
            statusCode: 500,
          });
        }
        return;
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError({
          code: 'DATABASE_UNAVAILABLE',
          message: `Database quota release failed: ${err?.message || 'Connection failure'}`,
          statusCode: 503,
        });
      }
    }

    // In-Memory Fallback strictly restricted to test mode
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError({
        code: 'CONFIGURATION_ERROR',
        message: 'Database client is strictly required for quota management in non-test environments.',
        statusCode: 500,
      });
    }

    const reserve = QuotaService.IN_MEMORY_RESERVES.get(params.idempotencyKey);
    if (reserve) {
      reserve.status = 'released';
    }
  }

  // ==========================================================================
  // IUsageMeteringService & IUsageLedgerService (Backward Compatibility)
  // ==========================================================================

  public async recordUsage(params: {
    organizationId: string;
    meetingId?: string;
    operation: LedgerOperation;
    quantity: number;
    unit: string;
    idempotencyKey: string;
    costCentsUsd?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; recorded: boolean }> {
    const id = crypto.randomUUID();

    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('usage_ledger').insert({
          id,
          organization_id: params.organizationId,
          meeting_id: params.meetingId || null,
          operation: params.operation,
          quantity: params.quantity,
          unit: params.unit,
          cost_cents_usd: params.costCentsUsd || 0,
          idempotency_key: params.idempotencyKey,
          status: 'settled',
          metadata: (params.metadata || {}) as any,
        });

        if (error) {
          throw new AppError({
            code: 'DATABASE_ERROR',
            message: `Failed to record usage in database: ${error.message}`,
            statusCode: 500,
          });
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError({
          code: 'DATABASE_UNAVAILABLE',
          message: `Database usage recording failed: ${err?.message || 'Connection failure'}`,
          statusCode: 503,
        });
      }

      return { id, recorded: true };
    }

    if (process.env.NODE_ENV !== 'test') {
      throw new AppError({
        code: 'CONFIGURATION_ERROR',
        message: 'Database client is strictly required for quota management in non-test environments.',
        statusCode: 500,
      });
    }

    QuotaService.IN_MEMORY_SETTLED.set(params.idempotencyKey, {
      id,
      organizationId: params.organizationId,
      operation: params.operation,
      quantity: params.quantity,
      status: 'settled',
    });

    return { id, recorded: true };
  }

  public async reserveQuota(params: QuotaReservationParams): Promise<{ reservationId: string; reservedQuantity: number }> {
    const res = await this.reserveMinutes({
      organizationId: params.organizationId,
      minutes: params.estimatedQuantity,
      idempotencyKey: params.idempotencyKey,
    });
    return { reservationId: res.reservationId, reservedQuantity: params.estimatedQuantity };
  }

  public async settleQuota(params: QuotaSettlementParams): Promise<{ ledgerId: string; settledQuantity: number }> {
    const res = await this.settleMinutes({
      idempotencyKey: params.idempotencyKey,
      actualMinutes: params.actualQuantity,
    });
    return { ledgerId: crypto.randomUUID(), settledQuantity: res.settledMinutes };
  }

  public async releaseQuota(idempotencyKey: string, reason?: string): Promise<void> {
    await this.releaseMinutes({ idempotencyKey, reason });
  }

  public async getOrganizationBalance(organizationId: string): Promise<{
    usedMinutes: number;
    totalMinutesLimit: number;
    remainingMinutes: number;
  }> {
    const limits = await this.getOrganizationPlanLimits(organizationId);

    // Database path: Authoritative computation directly from usage_ledger and active organization_quota_reserves
    if (this.supabase) {
      try {
        const { data: usageData, error: usageErr } = await this.supabase
          .from('usage_ledger')
          .select('quantity')
          .eq('organization_id', organizationId)
          .eq('operation', 'transcription_minutes')
          .eq('status', 'settled');

        if (usageErr) {
          throw new AppError({
            code: 'DATABASE_ERROR',
            message: `Failed to query usage ledger: ${usageErr.message}`,
            statusCode: 500,
          });
        }

        const { data: reserveData, error: resErr } = await this.supabase
          .from('organization_quota_reserves')
          .select('reserved_quantity')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString());

        if (resErr) {
          throw new AppError({
            code: 'DATABASE_ERROR',
            message: `Failed to query quota reserves: ${resErr.message}`,
            statusCode: 500,
          });
        }

        const settledMinutes = (usageData || []).reduce((acc, row) => acc + Number(row.quantity || 0), 0);
        const activeReservedMinutes = (reserveData || []).reduce((acc, row) => acc + Number(row.reserved_quantity || 0), 0);
        const usedMinutes = settledMinutes + activeReservedMinutes;
        const remainingMinutes = Math.max(0, limits.monthlyMinutes - usedMinutes);

        return {
          usedMinutes,
          totalMinutesLimit: limits.monthlyMinutes,
          remainingMinutes,
        };
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError({
          code: 'DATABASE_UNAVAILABLE',
          message: `Failed to calculate organization balance from database: ${err?.message || 'Connection failure'}`,
          statusCode: 503,
        });
      }
    }

    // In-Memory Mock: Strictly restricted to unit test mode
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError({
        code: 'CONFIGURATION_ERROR',
        message: 'Database client is strictly required for quota management in non-test environments.',
        statusCode: 500,
      });
    }

    let usedMinutes = 0;
    for (const record of QuotaService.IN_MEMORY_SETTLED.values()) {
      if (record.organizationId === organizationId && record.status === 'settled') {
        usedMinutes += record.quantity;
      }
    }

    const now = Date.now();
    for (const reserve of QuotaService.IN_MEMORY_RESERVES.values()) {
      if (reserve.organizationId === organizationId && reserve.status === 'active' && reserve.expiresAt > now) {
        usedMinutes += reserve.quantity;
      }
    }

    const remainingMinutes = Math.max(0, limits.monthlyMinutes - usedMinutes);
    return {
      usedMinutes,
      totalMinutesLimit: limits.monthlyMinutes,
      remainingMinutes,
    };
  }
}
