import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, SubscriptionStatus, BillingCurrency, BillingInterval } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { ISubscriptionService, SubscriptionRecord, IBillingService } from './types';
import { CatalogService } from './catalog-service';

export class SubscriptionService implements ISubscriptionService {
  private readonly catalogService: IBillingService;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    catalogService?: IBillingService
  ) {
    this.catalogService = catalogService || new CatalogService(supabase);
  }

  // Fallback in-memory map for unit test runs
  private static readonly IN_MEMORY_SUBSCRIPTIONS = new Map<string, SubscriptionRecord>();

  // Strict state machine transitions
  private static readonly ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    trialing: ['active', 'cancelled', 'expired'],
    active: ['past_due', 'grace_period', 'cancelled', 'suspended'],
    past_due: ['active', 'grace_period', 'suspended', 'cancelled'],
    grace_period: ['active', 'suspended', 'cancelled'],
    suspended: ['active', 'cancelled', 'expired'],
    cancelled: ['active'], // Reactivation allowed
    canceled: ['active'],  // Legacy alias
    unpaid: ['active', 'cancelled', 'expired'],
    expired: [], // Terminal, requires new checkout
  };

  public async getSubscription(organizationId: string): Promise<SubscriptionRecord | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('subscriptions')
          .select('*')
          .eq('organization_id', organizationId)
          .single();

        if (data && !error) {
          return {
            id: data.id,
            organizationId: data.organization_id,
            planId: data.plan_id,
            planPriceId: data.plan_price_id,
            status: data.status,
            currency: data.currency,
            billingInterval: data.billing_interval,
            currentPeriodStart: data.current_period_start,
            currentPeriodEnd: data.current_period_end,
            cancelAtPeriodEnd: data.cancel_at_period_end,
            gracePeriodEndsAt: data.grace_period_ends_at,
            suspendedAt: data.suspended_at,
            suspendedReason: data.suspended_reason,
            cancelledAt: data.cancelled_at,
            cancellationReason: data.cancellation_reason,
            externalSubscriptionId: data.external_subscription_id,
            provider: data.provider,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return SubscriptionService.IN_MEMORY_SUBSCRIPTIONS.get(organizationId) || null;
  }

  public async createSubscription(params: {
    organizationId: string;
    planId: string;
    planPriceId: string;
    provider?: string;
    externalSubscriptionId?: string;
  }): Promise<SubscriptionRecord> {
    const existing = await this.getSubscription(params.organizationId);
    if (existing && existing.status === 'active') {
      throw new AppError({
        code: 'SUBSCRIPTION_ALREADY_EXISTS',
        message: 'Organization already has an active subscription.',
        statusCode: 409,
      });
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const record: SubscriptionRecord = {
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      planId: params.planId,
      planPriceId: params.planPriceId,
      status: 'active',
      currency: 'USD',
      billingInterval: 'monthly',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
      suspendedAt: null,
      suspendedReason: null,
      cancelledAt: null,
      cancellationReason: null,
      externalSubscriptionId: params.externalSubscriptionId || null,
      provider: params.provider || 'mock',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (this.supabase) {
      try {
        await this.supabase.from('subscriptions').upsert({
          id: record.id,
          organization_id: record.organizationId,
          plan_id: record.planId,
          plan_price_id: record.planPriceId,
          status: record.status,
          currency: record.currency,
          billing_interval: record.billingInterval,
          current_period_start: record.currentPeriodStart,
          current_period_end: record.currentPeriodEnd,
          cancel_at_period_end: record.cancelAtPeriodEnd,
          provider: record.provider,
          external_subscription_id: record.externalSubscriptionId,
        });
      } catch {
        // In-memory fallback
      }
    }

    SubscriptionService.IN_MEMORY_SUBSCRIPTIONS.set(params.organizationId, record);
    return record;
  }

  public async transitionStatus(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    reason?: string
  ): Promise<SubscriptionRecord> {
    const sub = await this.findSubscriptionById(subscriptionId);
    if (!sub) {
      throw new AppError({
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: `Subscription '${subscriptionId}' was not found.`,
        statusCode: 404,
      });
    }

    const allowed = SubscriptionService.ALLOWED_TRANSITIONS[sub.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new AppError({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition subscription from '${sub.status}' to '${newStatus}'.`,
        statusCode: 400,
      });
    }

    const now = new Date().toISOString();
    sub.status = newStatus;
    sub.updatedAt = now;

    if (newStatus === 'grace_period') {
      // 7-day grace period
      sub.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (newStatus === 'suspended') {
      sub.suspendedAt = now;
      sub.suspendedReason = reason || 'Payment default or administrative action';
    } else if (newStatus === 'cancelled') {
      sub.cancelledAt = now;
      sub.cancellationReason = reason || 'Customer requested cancellation';
    } else if (newStatus === 'active') {
      // Clear penalties
      sub.gracePeriodEndsAt = null;
      sub.suspendedAt = null;
      sub.suspendedReason = null;
    }

    this.saveSubscription(sub);
    return sub;
  }

  public async cancelSubscription(
    subscriptionId: string,
    reason?: string,
    immediate = false
  ): Promise<SubscriptionRecord> {
    const sub = await this.findSubscriptionById(subscriptionId);
    if (!sub) {
      throw new AppError({
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: `Subscription '${subscriptionId}' was not found.`,
        statusCode: 404,
      });
    }

    if (immediate) {
      return await this.transitionStatus(subscriptionId, 'cancelled', reason);
    } else {
      sub.cancelAtPeriodEnd = true;
      sub.cancellationReason = reason || 'Scheduled cancel at period end';
      sub.updatedAt = new Date().toISOString();
      this.saveSubscription(sub);
      return sub;
    }
  }

  public async reactivateSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const sub = await this.findSubscriptionById(subscriptionId);
    if (!sub) {
      throw new AppError({
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: `Subscription '${subscriptionId}' was not found.`,
        statusCode: 404,
      });
    }

    if (sub.status === 'cancelled') {
      return await this.transitionStatus(subscriptionId, 'active');
    }

    sub.cancelAtPeriodEnd = false;
    sub.cancellationReason = null;
    sub.updatedAt = new Date().toISOString();
    this.saveSubscription(sub);
    return sub;
  }

  public async upgradePlan(subscriptionId: string, newPlanPriceId: string): Promise<SubscriptionRecord> {
    const sub = await this.findSubscriptionById(subscriptionId);
    if (!sub) {
      throw new AppError({
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: `Subscription '${subscriptionId}' was not found.`,
        statusCode: 404,
      });
    }

    sub.planPriceId = newPlanPriceId;
    sub.updatedAt = new Date().toISOString();
    this.saveSubscription(sub);
    return sub;
  }

  private async findSubscriptionById(id: string): Promise<SubscriptionRecord | null> {
    for (const sub of SubscriptionService.IN_MEMORY_SUBSCRIPTIONS.values()) {
      if (sub.id === id) return sub;
    }

    if (this.supabase) {
      const { data } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        return {
          id: data.id,
          organizationId: data.organization_id,
          planId: data.plan_id,
          planPriceId: data.plan_price_id,
          status: data.status,
          currency: data.currency,
          billingInterval: data.billing_interval,
          currentPeriodStart: data.current_period_start,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
          gracePeriodEndsAt: data.grace_period_ends_at,
          suspendedAt: data.suspended_at,
          suspendedReason: data.suspended_reason,
          cancelledAt: data.cancelled_at,
          cancellationReason: data.cancellation_reason,
          externalSubscriptionId: data.external_subscription_id,
          provider: data.provider,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    }

    return null;
  }

  private saveSubscription(sub: SubscriptionRecord): void {
    SubscriptionService.IN_MEMORY_SUBSCRIPTIONS.set(sub.organizationId, sub);
    if (this.supabase) {
      this.supabase
        .from('subscriptions')
        .update({
          status: sub.status,
          plan_price_id: sub.planPriceId,
          cancel_at_period_end: sub.cancelAtPeriodEnd,
          grace_period_ends_at: sub.gracePeriodEndsAt,
          suspended_at: sub.suspendedAt,
          suspended_reason: sub.suspendedReason,
          cancelled_at: sub.cancelledAt,
          cancellation_reason: sub.cancellationReason,
          updated_at: sub.updatedAt,
        })
        .eq('id', sub.id)
        .then(() => {});
    }
  }
}
