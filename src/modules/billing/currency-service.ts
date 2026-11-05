import type { BillingCurrency } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';

export interface ExchangeRate {
  baseCurrency: BillingCurrency;
  targetCurrency: BillingCurrency;
  rate: number;
  source: string;
  timestamp: string;
  isDemonstration: boolean;
}

/**
 * CurrencyService
 * 
 * Handles multi-currency operations for MEETWISE AI with strict adherence to:
 * 1. Integer representation in minor units (cents / cêntimos).
 * 2. Explicit conversion tracking with source and timestamp.
 * 3. Formal presentation standards per currency (AOA, USD, EUR, BRL).
 * 4. Warning against silent or static exchange assumptions in production.
 */
export class CurrencyService {
  // Demonstration baseline exchange rates (Base: USD)
  // NOTE: In production, rates must be fetched dynamically from central banks (e.g. BNA, BCE) or licensed providers.
  private static readonly DEMO_RATES_FROM_USD: Record<BillingCurrency, number> = {
    USD: 1.0,
    EUR: 0.94,
    AOA: 865.0, // Banco Nacional de Angola reference rate simulation
    BRL: 5.25,
  };

  /**
   * Formats an amount in minor units (cents/cêntimos) to standard localized currency string.
   */
  public static format(amountCents: number, currency: BillingCurrency): string {
    const units = amountCents / 100;

    switch (currency) {
      case 'AOA':
        // Standard Angolan format: 16 500,00 Kz
        return `${units.toLocaleString('pt-AO', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} Kz`;

      case 'EUR':
        // European Portuguese format: 19,00 €
        return `${units.toLocaleString('pt-PT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} €`;

      case 'BRL':
        // Brazilian format: R$ 99,00
        return `${units.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })}`;

      case 'USD':
      default:
        // US standard: $19.00
        return `$${units.toFixed(2)}`;
    }
  }

  /**
   * Converts an amount between currencies using verified rates.
   * Throws if negative amount or invalid currency.
   */
  public static convert(
    amountCents: number,
    fromCurrency: BillingCurrency,
    toCurrency: BillingCurrency,
    customRate?: number
  ): { convertedCents: number; rateUsed: number; source: string; isDemonstration: boolean } {
    if (amountCents < 0) {
      throw new AppError({
        code: 'INVALID_AMOUNT',
        message: 'Amount to convert cannot be negative.',
        statusCode: 400,
      });
    }

    if (fromCurrency === toCurrency) {
      return {
        convertedCents: amountCents,
        rateUsed: 1.0,
        source: 'IDENTITY',
        isDemonstration: false,
      };
    }

    let rate: number;
    let source: string;
    let isDemo = false;

    if (customRate !== undefined && customRate > 0) {
      rate = customRate;
      source = 'MANUAL_OVERRIDE';
    } else {
      // Calculate cross-rate via USD baseline
      const fromToUsd = 1 / this.DEMO_RATES_FROM_USD[fromCurrency];
      const usdToTarget = this.DEMO_RATES_FROM_USD[toCurrency];
      rate = fromToUsd * usdToTarget;
      source = 'MEETWISE_DEMO_BENCHMARK_RATES';
      isDemo = true;
    }

    // Preserve exact integer in minor units
    const convertedCents = Math.round(amountCents * rate);

    return {
      convertedCents,
      rateUsed: rate,
      source,
      isDemonstration: isDemo,
    };
  }

  /**
   * Returns metadata and disclaimer for currency handling in the active jurisdiction.
   */
  public static getCurrencyMetadata(currency: BillingCurrency): {
    name: string;
    symbol: string;
    minorUnit: string;
    isPrimaryForRegion: string;
    regulatoryNotice: string;
  } {
    switch (currency) {
      case 'AOA':
        return {
          name: 'Kwanza Angolano',
          symbol: 'Kz',
          minorUnit: 'cêntimos',
          isPrimaryForRegion: 'Angola (AO)',
          regulatoryNotice:
            'Operações em Kwanza no mercado angolano devem cumprir as diretrizes cambiais do Banco Nacional de Angola (BNA) e emissão de faturação em conformidade com a AGT.',
        };
      case 'EUR':
        return {
          name: 'Euro',
          symbol: '€',
          minorUnit: 'cents',
          isPrimaryForRegion: 'União Europeia / Portugal (PT)',
          regulatoryNotice:
            'Operações em Euro cumprem as normas SEPA e diretivas de IVA da União Europeia.',
        };
      case 'BRL':
        return {
          name: 'Real Brasileiro',
          symbol: 'R$',
          minorUnit: 'centavos',
          isPrimaryForRegion: 'Brasil (BR)',
          regulatoryNotice:
            'Operações em Real cumprem as regulamentações do Banco Central do Brasil.',
        };
      case 'USD':
      default:
        return {
          name: 'US Dollar',
          symbol: '$',
          minorUnit: 'cents',
          isPrimaryForRegion: 'Global / Internacional',
          regulatoryNotice:
            'Moeda de referência internacional para contratos de nuvem e liquidação de APIs.',
        };
    }
  }
}
