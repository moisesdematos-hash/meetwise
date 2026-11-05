import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { IRefundService, RefundRecord, IInvoiceService } from './types';
import { PaymentProviderRegistry } from './providers/registry';
import { FinancialLedgerService } from './financial-ledger-service';
import { InvoiceService } from './invoice-service';

export class RefundService implements IRefundService {
  private readonly registry: PaymentProviderRegistry;
  private readonly ledgerService: FinancialLedgerService;
  private readonly invoiceService: IInvoiceService;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    registry?: PaymentProviderRegistry,
    ledgerService?: FinancialLedgerService,
    invoiceService?: IInvoiceService
  ) {
    this.registry = registry || PaymentProviderRegistry.getInstance();
    this.ledgerService = ledgerService || new FinancialLedgerService(supabase);
    this.invoiceService = invoiceService || new InvoiceService(supabase);
  }

  private static readonly IN_MEMORY_REFUNDS = new Map<string, RefundRecord>();

  public async requestRefund(params: {
    organizationId: string;
    invoiceId: string;
    amountCents: number;
    reason: string;
    requestedBy: string;
  }): Promise<RefundRecord> {
    const invoice = await this.invoiceService.getInvoice(params.invoiceId);
    if (!invoice) {
      throw new AppError({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice '${params.invoiceId}' not found.`,
        statusCode: 404,
      });
    }

    if (invoice.status !== 'paid') {
      throw new AppError({
        code: 'INVOICE_NOT_PAID',
        message: 'Cannot refund an invoice that has not been paid.',
        statusCode: 400,
      });
    }

    if (params.amountCents <= 0 || params.amountCents > invoice.totalCents) {
      throw new AppError({
        code: 'INVALID_REFUND_AMOUNT',
        message: `Refund amount must be between 1 and ${invoice.totalCents} cents.`,
        statusCode: 400,
      });
    }

    const refundId = crypto.randomUUID();
    const record: RefundRecord = {
      id: refundId,
      organizationId: params.organizationId,
      invoiceId: params.invoiceId,
      paymentEventId: null,
      amountCents: params.amountCents,
      currency: invoice.currency,
      reason: params.reason,
      status: 'pending',
      externalRefundId: null,
      processedBy: null,
      metadata: { requestedBy: params.requestedBy },
      createdAt: new Date().toISOString(),
      processedAt: null,
    };

    RefundService.IN_MEMORY_REFUNDS.set(refundId, record);

    if (this.supabase) {
      try {
        await this.supabase.from('refunds').insert({
          id: record.id,
          organization_id: record.organizationId,
          invoice_id: record.invoiceId,
          amount_cents: record.amountCents,
          currency: record.currency,
          reason: record.reason,
          status: record.status,
          metadata: record.metadata as any,
        });
      } catch {
        // Fallback
      }
    }

    return record;
  }

  public async processRefund(refundId: string, approvedBy: string): Promise<RefundRecord> {
    const refund = RefundService.IN_MEMORY_REFUNDS.get(refundId);
    if (!refund) {
      throw new AppError({
        code: 'REFUND_NOT_FOUND',
        message: `Refund request '${refundId}' was not found.`,
        statusCode: 404,
      });
    }

    if (refund.status !== 'pending') {
      throw new AppError({
        code: 'REFUND_ALREADY_PROCESSED',
        message: `Refund is already in status '${refund.status}'.`,
        statusCode: 400,
      });
    }

    // Call payment provider
    const provider = this.registry.getProvider('mock');
    const result = await provider.processRefund({
      externalPaymentId: refund.invoiceId || 'mock_pay',
      amountCents: refund.amountCents,
      reason: refund.reason,
    });

    if (result.status === 'processed') {
      refund.status = 'processed';
      refund.externalRefundId = result.externalRefundId;
      refund.processedBy = approvedBy;
      refund.processedAt = new Date().toISOString();

      // Record compensatory entries in financial ledger (Debit Refund Expense, Credit Cash)
      await this.ledgerService.recordRefund({
        organizationId: refund.organizationId,
        amountCents: refund.amountCents,
        currency: refund.currency,
        referenceId: refund.id,
        description: `Compensatory refund for invoice ${refund.invoiceId}: ${refund.reason}`,
      });

      if (this.supabase) {
        try {
          await this.supabase
            .from('refunds')
            .update({
              status: 'processed',
              external_refund_id: refund.externalRefundId,
              processed_by: approvedBy,
              processed_at: refund.processedAt,
            })
            .eq('id', refundId);
        } catch {
          // Fallback
        }
      }
    } else {
      refund.status = 'failed';
    }

    RefundService.IN_MEMORY_REFUNDS.set(refundId, refund);
    return refund;
  }
}
