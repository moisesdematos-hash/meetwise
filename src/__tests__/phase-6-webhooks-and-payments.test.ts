import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { WebhookService } from '@/modules/billing/webhook-service';
import { SubscriptionService } from '@/modules/billing/subscription-service';

describe('Phase 6 — Webhooks Processing & Payment Reconciliation', () => {
  const subService = new SubscriptionService();
  const webhookService = new WebhookService(undefined, undefined, subService);
  const secret = process.env.MOCK_WEBHOOK_SECRET || 'demo-webhook-secret';

  it('should reject webhook payloads with invalid cryptographic signatures', async () => {
    const rawPayload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const invalidSignature = 'invalid-hex-signature-1234';

    await expect(
      webhookService.processWebhookEvent({
        provider: 'mock',
        rawPayload,
        signature: invalidSignature,
      })
    ).rejects.toThrow();
  });

  it('should verify signature and process payment_intent.succeeded event idempotently', async () => {
    const orgId = 'org-webhook-test-1';
    await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-pro-uuid',
      planPriceId: 'price-pro-usd-m',
    });
    // Put in past_due to test recovery
    const sub = await subService.getSubscription(orgId);
    await subService.transitionStatus(sub!.id, 'past_due');

    const eventPayload = {
      id: `evt_${crypto.randomBytes(8).toString('hex')}`,
      type: 'payment_intent.succeeded',
      organizationId: orgId,
      amountCents: 1900,
      currency: 'USD',
    };
    const rawPayload = JSON.stringify(eventPayload);
    const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    // 1st delivery
    const result1 = await webhookService.processWebhookEvent({
      provider: 'mock',
      rawPayload,
      signature,
      eventId: eventPayload.id,
    });
    expect(result1.status).toBe('processed');

    // Verify subscription returned to active
    const updatedSub = await subService.getSubscription(orgId);
    expect(updatedSub?.status).toBe('active');

    // 2nd delivery (Replay / Duplicate)
    const result2 = await webhookService.processWebhookEvent({
      provider: 'mock',
      rawPayload,
      signature,
      eventId: eventPayload.id,
    });
    expect(result2.status).toBe('ignored');
    expect(result2.message).toContain('already processed');
  });

  it('should transition subscription to grace_period on payment failure', async () => {
    const orgId = 'org-webhook-test-fail';
    await subService.createSubscription({
      organizationId: orgId,
      planId: 'plan-pro-uuid',
      planPriceId: 'price-pro-usd-m',
    });

    const eventPayload = {
      id: `evt_fail_${crypto.randomBytes(8).toString('hex')}`,
      type: 'payment_intent.failed',
      organizationId: orgId,
    };
    const rawPayload = JSON.stringify(eventPayload);
    const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    const result = await webhookService.processWebhookEvent({
      provider: 'mock',
      rawPayload,
      signature,
      eventId: eventPayload.id,
    });
    expect(result.status).toBe('processed');

    const sub = await subService.getSubscription(orgId);
    expect(sub?.status).toBe('grace_period');
    expect(sub?.gracePeriodEndsAt).toBeDefined();
  });
});
