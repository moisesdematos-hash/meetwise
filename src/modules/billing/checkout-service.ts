import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { ICheckoutService, CheckoutIntentParams, CheckoutSessionData, IBillingService } from './types';
import { CatalogService } from './catalog-service';
import { PaymentProviderRegistry } from './providers/registry';

export class CheckoutService implements ICheckoutService {
  private readonly catalogService: IBillingService;
  private readonly registry: PaymentProviderRegistry;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    catalogService?: IBillingService,
    registry?: PaymentProviderRegistry
  ) {
    this.catalogService = catalogService || new CatalogService(supabase);
    this.registry = registry || PaymentProviderRegistry.getInstance();
  }

  // Fallback in-memory store for unit test execution without database connection
  private static readonly IN_MEMORY_SESSIONS = new Map<string, CheckoutSessionData>();

  public async createSession(params: CheckoutIntentParams): Promise<CheckoutSessionData> {
    // 1. Resolve Plan and Price strictly from the Server-Side Catalog (NEVER trust frontend price)
    const plan = await this.catalogService.getPlanByCode(params.planCode);
    const planPrice = await this.catalogService.getPlanPrice(plan.id, params.currency, params.interval);

    if (!planPrice.isActive) {
      throw new AppError({
        code: 'PRICE_INACTIVE',
        message: 'The selected plan price is no longer active.',
        statusCode: 400,
      });
    }

    // 2. Validate Payment Provider
    const provider = this.registry.getProvider(params.provider);
    if (!provider.supportedCurrencies.includes(params.currency)) {
      throw new AppError({
        code: 'CURRENCY_NOT_SUPPORTED',
        message: `Provider '${params.provider}' does not support currency '${params.currency}'.`,
        statusCode: 400,
      });
    }

    // 3. Generate Unique Session Reference and Expiration
    const sessionReference = `cs_ref_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes validity

    const sessionData: CheckoutSessionData = {
      id: crypto.randomUUID(),
      organizationId: params.organizationId,
      userId: params.userId,
      planId: plan.id,
      planPriceId: planPrice.id,
      provider: params.provider,
      currency: params.currency,
      amountCents: planPrice.amountCents,
      billingInterval: params.interval,
      status: 'open',
      sessionReference,
      providerCheckoutId: null,
      providerUrl: null,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      expiresAt,
      metadata: {
        planCode: plan.code,
        monthlyMinutes: plan.monthlyMinutesIncluded,
      },
    };

    // 4. Create External Intent via Provider
    const intent = await provider.createCheckoutIntent(sessionData);
    sessionData.providerCheckoutId = intent.externalId;
    sessionData.providerUrl = intent.checkoutUrl;

    // 5. Persist Session in Database (or in-memory fallback)
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('checkout_sessions').insert({
          id: sessionData.id,
          organization_id: sessionData.organizationId,
          user_id: sessionData.userId,
          plan_id: sessionData.planId,
          plan_price_id: sessionData.planPriceId,
          provider: sessionData.provider,
          currency: sessionData.currency,
          amount_cents: sessionData.amountCents,
          billing_interval: sessionData.billingInterval,
          status: sessionData.status,
          session_reference: sessionData.sessionReference,
          provider_checkout_id: sessionData.providerCheckoutId,
          provider_url: sessionData.providerUrl,
          success_url: sessionData.successUrl,
          cancel_url: sessionData.cancelUrl,
          expires_at: sessionData.expiresAt,
          metadata: sessionData.metadata as any,
        });

        if (error) {
          // Fallback to in-memory if table insert fails
          CheckoutService.IN_MEMORY_SESSIONS.set(sessionReference, sessionData);
        }
      } catch {
        CheckoutService.IN_MEMORY_SESSIONS.set(sessionReference, sessionData);
      }
    } else {
      CheckoutService.IN_MEMORY_SESSIONS.set(sessionReference, sessionData);
    }

    return sessionData;
  }

  public async getSession(sessionReference: string): Promise<CheckoutSessionData | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('checkout_sessions')
          .select('*')
          .eq('session_reference', sessionReference)
          .single();

        if (data && !error) {
          return {
            id: data.id,
            organizationId: data.organization_id,
            userId: data.user_id,
            planId: data.plan_id,
            planPriceId: data.plan_price_id,
            provider: data.provider,
            currency: data.currency,
            amountCents: data.amount_cents,
            billingInterval: data.billing_interval,
            status: data.status,
            sessionReference: data.session_reference,
            providerCheckoutId: data.provider_checkout_id,
            providerUrl: data.provider_url,
            successUrl: data.success_url,
            cancelUrl: data.cancel_url,
            expiresAt: data.expires_at,
            metadata: (data.metadata || {}) as Record<string, unknown>,
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return CheckoutService.IN_MEMORY_SESSIONS.get(sessionReference) || null;
  }

  public async expireSession(sessionReference: string): Promise<void> {
    const session = await this.getSession(sessionReference);
    if (session) {
      session.status = 'expired';
      CheckoutService.IN_MEMORY_SESSIONS.set(sessionReference, session);

      if (this.supabase) {
        try {
          await this.supabase
            .from('checkout_sessions')
            .update({ status: 'expired' })
            .eq('session_reference', sessionReference);
        } catch {
          // Ignored
        }
      }
    }
  }
}
