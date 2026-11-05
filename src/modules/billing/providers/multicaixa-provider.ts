import crypto from 'crypto';
import type { BillingCurrency } from '@/lib/supabase/database.types';
import type { IPaymentProvider, CheckoutSessionData } from '../types';

export class MulticaixaProxyPaymentProvider implements IPaymentProvider {
  public readonly id = 'multicaixa';
  public readonly name = 'Multicaixa Express / EMIS Proxy Gateway (Angola)';
  public readonly supportedCurrencies: BillingCurrency[] = ['AOA'];

  private readonly secretKey?: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey || process.env.MULTICAIXA_SECRET_KEY;
  }

  public isAvailableForCountry(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'AO';
  }

  public async createCheckoutIntent(session: CheckoutSessionData): Promise<{ externalId: string; checkoutUrl: string }> {
    // Generate standard Multicaixa payment reference (9 digits)
    const entity = '00123'; // Demo Multicaixa entity code
    const reference = Math.floor(100000000 + Math.random() * 900000000).toString();
    const externalId = `mcx_${entity}_${reference}`;

    const checkoutUrl = `/api/billing/multicaixa/reference?ref=${session.sessionReference}&external_id=${externalId}&entity=${entity}&mcx_ref=${reference}&amount=${session.amountCents}`;
    return { externalId, checkoutUrl };
  }

  public async verifyWebhookSignature(payload: string, signature: string, secret?: string): Promise<boolean> {
    const activeSecret = secret || this.secretKey || 'demo-multicaixa-secret';
    if (!signature) return false;

    const expected = crypto.createHmac('sha256', activeSecret).update(payload).digest('hex');
    return expected === signature;
  }

  public async processRefund(params: {
    externalPaymentId: string;
    amountCents: number;
    reason: string;
  }): Promise<{ externalRefundId: string; status: 'processed' | 'failed' }> {
    // Multicaixa Express refunds typically require banking reversal protocols through EMIS
    if (!params.externalPaymentId || params.amountCents <= 0) {
      return { externalRefundId: '', status: 'failed' };
    }
    const externalRefundId = `mcx_reversal_${crypto.randomBytes(8).toString('hex')}`;
    return { externalRefundId, status: 'processed' };
  }
}
