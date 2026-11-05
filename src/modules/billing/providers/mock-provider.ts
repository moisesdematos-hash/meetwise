import crypto from 'crypto';
import type { BillingCurrency } from '@/lib/supabase/database.types';
import type { IPaymentProvider, CheckoutSessionData } from '../types';

export class MockPaymentProvider implements IPaymentProvider {
  public readonly id = 'mock';
  public readonly name = 'MEETWISE Simulated Sandbox Gateway';
  public readonly supportedCurrencies: BillingCurrency[] = ['USD', 'EUR', 'AOA', 'BRL'];

  public isAvailableForCountry(_countryCode: string): boolean {
    return true; // Available in sandbox everywhere
  }

  public async createCheckoutIntent(session: CheckoutSessionData): Promise<{ externalId: string; checkoutUrl: string }> {
    const externalId = `mock_cs_${crypto.randomBytes(12).toString('hex')}`;
    const checkoutUrl = `/api/billing/mock/checkout?session_id=${session.sessionReference}&mock_id=${externalId}`;
    return { externalId, checkoutUrl };
  }

  public async verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    if (!signature || !secret) return false;
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return computed === signature;
  }

  public async processRefund(params: {
    externalPaymentId: string;
    amountCents: number;
    reason: string;
  }): Promise<{ externalRefundId: string; status: 'processed' | 'failed' }> {
    if (params.amountCents <= 0) {
      return { externalRefundId: '', status: 'failed' };
    }
    const externalRefundId = `mock_re_${crypto.randomBytes(12).toString('hex')}`;
    return { externalRefundId, status: 'processed' };
  }
}
