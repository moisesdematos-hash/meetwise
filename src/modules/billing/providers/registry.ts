import type { BillingCurrency } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { IPaymentProvider } from '../types';
import { MockPaymentProvider } from './mock-provider';
import { StripePaymentProvider } from './stripe-provider';
import { MulticaixaProxyPaymentProvider } from './multicaixa-provider';

export class PaymentProviderRegistry {
  private static instance: PaymentProviderRegistry;
  private readonly providers = new Map<string, IPaymentProvider>();

  private constructor() {
    // Default system providers
    this.register(new MockPaymentProvider());
    this.register(new StripePaymentProvider());
    this.register(new MulticaixaProxyPaymentProvider());
  }

  public static getInstance(): PaymentProviderRegistry {
    if (!PaymentProviderRegistry.instance) {
      PaymentProviderRegistry.instance = new PaymentProviderRegistry();
    }
    return PaymentProviderRegistry.instance;
  }

  public register(provider: IPaymentProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): IPaymentProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AppError({
        code: 'PAYMENT_PROVIDER_NOT_FOUND',
        message: `Payment provider '${id}' is not registered or supported.`,
        statusCode: 404,
      });
    }
    return provider;
  }

  public listProviders(): IPaymentProvider[] {
    return Array.from(this.providers.values());
  }

  public getAvailableProvidersFor(countryCode: string, currency: BillingCurrency): IPaymentProvider[] {
    return this.listProviders().filter(
      (p) => p.supportedCurrencies.includes(currency) && p.isAvailableForCountry(countryCode)
    );
  }
}
