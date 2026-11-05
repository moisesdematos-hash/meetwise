import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { IWebhookService, ISubscriptionService, IInvoiceService, DoubleEntryTransaction } from './types';
import { PaymentProviderRegistry } from './providers/registry';
import { SubscriptionService } from './subscription-service';
import { FinancialLedgerService } from './financial-ledger-service';

export interface WebhookEventPayload {
  id: string; // Event ID from provider
  type:
    | 'checkout.session.completed'
    | 'payment_intent.succeeded'
    | 'payment_intent.failed'
    | 'customer.subscription.renewed'
    | 'customer.subscription.deleted'
    | 'charge.refunded';
  organizationId: string;
  amountCents?: number;
  currency?: string;
  subscriptionId?: string;
  externalPaymentId?: string;
  timestamp?: number;
}

export class WebhookService implements IWebhookService {
  private readonly registry: PaymentProviderRegistry;
  private readonly subscriptionService: ISubscriptionService;
  private readonly ledgerService: FinancialLedgerService;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    registry?: PaymentProviderRegistry,
    subscriptionService?: ISubscriptionService,
    ledgerService?: FinancialLedgerService
  ) {
    this.registry = registry || PaymentProviderRegistry.getInstance();
    this.subscriptionService = subscriptionService || new SubscriptionService(supabase);
    this.ledgerService = ledgerService || new FinancialLedgerService(supabase);
  }

  // Deduplication store for unit tests
  private static readonly PROCESSED_EVENT_IDS = new Set<string>();

  public async processWebhookEvent(params: {
    provider: string;
    rawPayload: string;
    signature: string;
    eventId?: string;
  }): Promise<{ status: 'processed' | 'ignored' | 'failed'; message: string }> {
    // 1. Resolve Provider
    const provider = this.registry.getProvider(params.provider);

    // 2. Cryptographic Signature Verification
    const webhookSecret = process.env[`${params.provider.toUpperCase()}_WEBHOOK_SECRET`] || 'demo-webhook-secret';
    const isValid = await provider.verifyWebhookSignature(params.rawPayload, params.signature, webhookSecret);

    if (!isValid) {
      throw new AppError({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: `Webhook signature verification failed for provider '${params.provider}'.`,
        statusCode: 401,
      });
    }

    // 3. Parse Payload
    let parsed: WebhookEventPayload;
    try {
      parsed = JSON.parse(params.rawPayload);
    } catch {
      throw new AppError({
        code: 'MALFORMED_WEBHOOK_PAYLOAD',
        message: 'Could not parse JSON webhook body.',
        statusCode: 400,
      });
    }

    const eventId = params.eventId || parsed.id || `evt_${crypto.randomBytes(8).toString('hex')}`;

    // 4. Deduplication & Idempotency Check
    if (WebhookService.PROCESSED_EVENT_IDS.has(eventId)) {
      return {
        status: 'ignored',
        message: `Event '${eventId}' already processed (Idempotency deduplication).`,
      };
    }

    if (this.supabase) {
      try {
        const { data: existingEvent } = await this.supabase
          .from('payment_events')
          .select('id, status')
          .eq('provider', params.provider)
          .eq('external_event_id', eventId)
          .single();

        if (existingEvent) {
          WebhookService.PROCESSED_EVENT_IDS.add(eventId);
          return {
            status: 'ignored',
            message: `Event '${eventId}' already exists in payment_events.`,
          };
        }
      } catch {
        // Continue
      }
    }

    // 5. Persist Raw Event in `payment_events` BEFORE applying business logic
    if (this.supabase && parsed.organizationId) {
      try {
        await this.supabase.from('payment_events').insert({
          organization_id: parsed.organizationId,
          provider: params.provider,
          external_event_id: eventId,
          event_type: parsed.type,
          amount_cents: parsed.amountCents || 0,
          currency: parsed.currency || 'USD',
          status: 'received',
          payload: parsed as any,
        });
      } catch {
        // Fallback
      }
    }

    // 6. Handle Event According to State Machine
    try {
      switch (parsed.type) {
        case 'checkout.session.completed':
        case 'payment_intent.succeeded': {
          const sub = await this.subscriptionService.getSubscription(parsed.organizationId);
          if (sub && (sub.status === 'past_due' || sub.status === 'grace_period')) {
            await this.subscriptionService.transitionStatus(sub.id, 'active');
          }

          // Record in double-entry financial ledger (Debit Cash, Credit Revenue)
          if (parsed.amountCents && parsed.amountCents > 0) {
            await this.ledgerService.recordPaymentReceived({
              organizationId: parsed.organizationId,
              amountCents: parsed.amountCents,
              currency: (parsed.currency as any) || 'USD',
              referenceId: eventId,
              description: `Subscription payment via ${params.provider}`,
            });
          }
          break;
        }

        case 'payment_intent.failed': {
          const sub = await this.subscriptionService.getSubscription(parsed.organizationId);
          if (sub && sub.status === 'active') {
            await this.subscriptionService.transitionStatus(
              sub.id,
              'grace_period',
              'Payment attempt failed on external provider'
            );
          }
          break;
        }

        case 'customer.subscription.renewed': {
          const sub = await this.subscriptionService.getSubscription(parsed.organizationId);
          if (sub) {
            await this.subscriptionService.transitionStatus(sub.id, 'active');
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = await this.subscriptionService.getSubscription(parsed.organizationId);
          if (sub && sub.status !== 'cancelled') {
            await this.subscriptionService.cancelSubscription(sub.id, 'External provider cancellation', true);
          }
          break;
        }

        case 'charge.refunded': {
          if (parsed.amountCents && parsed.amountCents > 0) {
            await this.ledgerService.recordRefund({
              organizationId: parsed.organizationId,
              amountCents: parsed.amountCents,
              currency: (parsed.currency as any) || 'USD',
              referenceId: eventId,
              description: `Refund processed via ${params.provider}`,
            });
          }
          break;
        }

        default:
          break;
      }

      WebhookService.PROCESSED_EVENT_IDS.add(eventId);

      // Update payment_events status to processed
      if (this.supabase) {
        await this.supabase
          .from('payment_events')
          .update({ status: 'processed' })
          .eq('provider', params.provider)
          .eq('external_event_id', eventId)
          .then(() => {});
      }

      return {
        status: 'processed',
        message: `Successfully processed event '${parsed.type}' [${eventId}].`,
      };
    } catch (err: any) {
      if (this.supabase) {
        await this.supabase
          .from('payment_events')
          .update({ status: 'failed' })
          .eq('provider', params.provider)
          .eq('external_event_id', eventId)
          .then(() => {});
      }

      throw new AppError({
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: `Failed to process webhook event: ${err.message}`,
        statusCode: 500,
      });
    }
  }
}
