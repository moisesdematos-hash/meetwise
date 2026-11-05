import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BillingCurrency, InvoiceStatus } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { IInvoiceService, InvoiceRecord, InvoiceLineRecord } from './types';
import { FinancialLedgerService } from './financial-ledger-service';

export class InvoiceService implements IInvoiceService {
  private readonly ledgerService: FinancialLedgerService;

  constructor(
    private readonly supabase?: SupabaseClient<Database>,
    ledgerService?: FinancialLedgerService
  ) {
    this.ledgerService = ledgerService || new FinancialLedgerService(supabase);
  }

  // In-memory invoice store
  private static readonly IN_MEMORY_INVOICES = new Map<string, InvoiceRecord>();

  public async createInvoice(params: {
    organizationId: string;
    subscriptionId?: string;
    currency: BillingCurrency;
    lines: { description: string; quantity: number; unitPriceCents: number }[];
    dueDate?: string;
    billingDetails?: Record<string, unknown>;
  }): Promise<InvoiceRecord> {
    if (!params.lines || params.lines.length === 0) {
      throw new AppError({
        code: 'INVOICE_LINES_EMPTY',
        message: 'Cannot create an invoice without line items.',
        statusCode: 400,
      });
    }

    let subtotalCents = 0;
    const linesWithTotals: InvoiceLineRecord[] = params.lines.map((l) => {
      const lineTotal = l.quantity * l.unitPriceCents;
      subtotalCents += lineTotal;
      return {
        id: crypto.randomUUID(),
        invoiceId: '',
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        totalPriceCents: lineTotal,
        periodStart: null,
        periodEnd: null,
      };
    });

    const taxCents = 0; // Tax calculation placeholder (e.g., IVA 14% Angola or 23% Portugal in production)
    const totalCents = subtotalCents + taxCents;

    const invoiceId = crypto.randomUUID();
    const currentYear = new Date().getFullYear();
    const invoiceNumber = `FAT-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`;

    const record: InvoiceRecord = {
      id: invoiceId,
      organizationId: params.organizationId,
      subscriptionId: params.subscriptionId || null,
      invoiceNumber,
      currency: params.currency,
      subtotalCents,
      taxCents,
      totalCents,
      status: 'issued',
      dueDate: params.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      paidAt: null,
      paymentReference: null,
      billingDetails: params.billingDetails || {
        issuer: 'MEETWISE AI LDA (Demonstration)',
        fiscalNotice: 'Recibo / Proforma Comercial. Não substitui fatura fiscal certificada pela AGT/AT.',
      },
      pdfUrl: null,
      lines: linesWithTotals.map((l) => ({ ...l, invoiceId })),
      createdAt: new Date().toISOString(),
    };

    InvoiceService.IN_MEMORY_INVOICES.set(invoiceId, record);

    if (this.supabase) {
      try {
        await this.supabase.from('invoices').insert({
          id: record.id,
          organization_id: record.organizationId,
          subscription_id: record.subscriptionId,
          invoice_number: record.invoiceNumber,
          currency: record.currency,
          subtotal_cents: record.subtotalCents,
          tax_cents: record.taxCents,
          total_cents: record.totalCents,
          status: record.status,
          due_date: record.dueDate,
          billing_details: record.billingDetails as any,
        });

        for (const line of record.lines) {
          await this.supabase.from('invoice_lines').insert({
            id: line.id,
            invoice_id: record.id,
            description: line.description,
            quantity: line.quantity,
            unit_price_cents: line.unitPriceCents,
            total_price_cents: line.totalPriceCents,
          });
        }
      } catch {
        // Fallback
      }
    }

    // Record in double-entry ledger (Debit Accounts Receivable, Credit Revenue)
    await this.ledgerService.recordInvoiceIssued({
      organizationId: record.organizationId,
      invoiceId: record.id,
      amountCents: record.totalCents,
      currency: record.currency,
      description: `Invoice ${record.invoiceNumber} issued`,
    });

    return record;
  }

  public async getInvoice(invoiceId: string): Promise<InvoiceRecord | null> {
    const memory = InvoiceService.IN_MEMORY_INVOICES.get(invoiceId);
    if (memory) return memory;

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single();

        if (data && !error) {
          const { data: lines } = await this.supabase
            .from('invoice_lines')
            .select('*')
            .eq('invoice_id', invoiceId);

          return {
            id: data.id,
            organizationId: data.organization_id,
            subscriptionId: data.subscription_id,
            invoiceNumber: data.invoice_number,
            currency: data.currency,
            subtotalCents: data.subtotal_cents,
            taxCents: data.tax_cents,
            totalCents: data.total_cents,
            status: data.status,
            dueDate: data.due_date,
            paidAt: data.paid_at,
            paymentReference: data.payment_reference,
            billingDetails: (data.billing_details || {}) as Record<string, unknown>,
            pdfUrl: data.pdf_url,
            lines: (lines || []).map((l) => ({
              id: l.id,
              invoiceId: l.invoice_id,
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unit_price_cents,
              totalPriceCents: l.total_price_cents,
              periodStart: l.period_start,
              periodEnd: l.period_end,
            })),
            createdAt: data.created_at,
          };
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  public async listOrganizationInvoices(organizationId: string): Promise<InvoiceRecord[]> {
    const memory = Array.from(InvoiceService.IN_MEMORY_INVOICES.values()).filter(
      (inv) => inv.organizationId === organizationId
    );

    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('invoices')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          return data.map((d) => ({
            id: d.id,
            organizationId: d.organization_id,
            subscriptionId: d.subscription_id,
            invoiceNumber: d.invoice_number,
            currency: d.currency,
            subtotalCents: d.subtotal_cents,
            taxCents: d.tax_cents,
            totalCents: d.total_cents,
            status: d.status,
            dueDate: d.due_date,
            paidAt: d.paid_at,
            paymentReference: d.payment_reference,
            billingDetails: (d.billing_details || {}) as Record<string, unknown>,
            pdfUrl: d.pdf_url,
            lines: [],
            createdAt: d.created_at,
          }));
        }
      } catch {
        // Fallback
      }
    }

    return memory;
  }

  public async markInvoicePaid(invoiceId: string, paymentReference: string): Promise<InvoiceRecord> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new AppError({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice '${invoiceId}' not found.`,
        statusCode: 404,
      });
    }

    invoice.status = 'paid';
    invoice.paidAt = new Date().toISOString();
    invoice.paymentReference = paymentReference;
    InvoiceService.IN_MEMORY_INVOICES.set(invoiceId, invoice);

    if (this.supabase) {
      try {
        await this.supabase
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: invoice.paidAt,
            payment_reference: paymentReference,
          })
          .eq('id', invoiceId);
      } catch {
        // Fallback
      }
    }

    // Record in double-entry ledger (Debit Cash, Credit Accounts Receivable)
    await this.ledgerService.recordPaymentReceived({
      organizationId: invoice.organizationId,
      amountCents: invoice.totalCents,
      currency: invoice.currency,
      referenceId: paymentReference,
      description: `Payment for invoice ${invoice.invoiceNumber}`,
    });

    return invoice;
  }
}
