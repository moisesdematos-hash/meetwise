import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BillingCurrency, LedgerAccountType, LedgerEntryType, LedgerReferenceType } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/errors/app-error';
import type { DoubleEntryTransaction } from './types';

export class FinancialLedgerService {
  constructor(private readonly supabase?: SupabaseClient<Database>) {}

  // In-memory ledger entries for deterministic testing
  private static readonly IN_MEMORY_LEDGER: {
    id: string;
    transactionId: string;
    organizationId: string;
    accountType: LedgerAccountType;
    entryType: LedgerEntryType;
    amountCents: number;
    currency: BillingCurrency;
    referenceType: LedgerReferenceType;
    referenceId: string;
    description: string;
    createdAt: string;
  }[] = [];

  /**
   * Records a balanced double-entry transaction.
   * INVARIANT: Total Debits MUST equal Total Credits.
   */
  public async recordTransaction(tx: DoubleEntryTransaction): Promise<{ transactionId: string; count: number }> {
    if (!tx.entries || tx.entries.length < 2) {
      throw new AppError({
        code: 'INVALID_TRANSACTION',
        message: 'A double-entry transaction must contain at least 2 balancing entries.',
        statusCode: 400,
      });
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of tx.entries) {
      if (entry.amountCents <= 0) {
        throw new AppError({
          code: 'INVALID_AMOUNT',
          message: 'Ledger entry amount must be strictly positive (greater than 0).',
          statusCode: 400,
        });
      }

      if (entry.entryType === 'debit') {
        totalDebits += entry.amountCents;
      } else if (entry.entryType === 'credit') {
        totalCredits += entry.amountCents;
      }
    }

    // Verify accounting balance
    if (totalDebits !== totalCredits) {
      throw new AppError({
        code: 'UNBALANCED_TRANSACTION',
        message: `Double-entry invariant violated: total debits (${totalDebits}) do not equal total credits (${totalCredits}).`,
        statusCode: 400,
        details: { totalDebits, totalCredits },
      });
    }

    const transactionId = tx.transactionId || crypto.randomUUID();
    const now = new Date().toISOString();

    const rowsToInsert = tx.entries.map((entry) => ({
      id: crypto.randomUUID(),
      transaction_id: transactionId,
      organization_id: tx.organizationId,
      account_type: entry.accountType,
      entry_type: entry.entryType,
      amount_cents: entry.amountCents,
      currency: tx.currency,
      reference_type: tx.referenceType,
      reference_id: tx.referenceId,
      description: tx.description,
      created_by: tx.createdBy || null,
      created_at: now,
    }));

    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('financial_ledger_entries')
          .insert(rowsToInsert);

        if (error) {
          throw new AppError({
            code: 'LEDGER_INSERT_FAILED',
            message: `Failed to insert financial ledger entries: ${error.message}`,
            statusCode: 500,
          });
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
      }
    }

    // Always store in-memory mirror for local tests
    for (const row of rowsToInsert) {
      FinancialLedgerService.IN_MEMORY_LEDGER.push({
        id: row.id,
        transactionId: row.transaction_id,
        organizationId: row.organization_id,
        accountType: row.account_type,
        entryType: row.entry_type,
        amountCents: row.amount_cents,
        currency: row.currency,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        description: row.description,
        createdAt: row.created_at,
      });
    }

    return { transactionId, count: rowsToInsert.length };
  }

  /**
   * Helper: Record an issued invoice
   * Debit Accounts Receivable, Credit Revenue
   */
  public async recordInvoiceIssued(params: {
    organizationId: string;
    invoiceId: string;
    amountCents: number;
    currency: BillingCurrency;
    description: string;
  }): Promise<{ transactionId: string }> {
    return await this.recordTransaction({
      transactionId: crypto.randomUUID(),
      organizationId: params.organizationId,
      currency: params.currency,
      referenceType: 'invoice',
      referenceId: params.invoiceId,
      description: params.description,
      entries: [
        { accountType: 'accounts_receivable', entryType: 'debit', amountCents: params.amountCents },
        { accountType: 'revenue', entryType: 'credit', amountCents: params.amountCents },
      ],
    });
  }

  /**
   * Helper: Record a payment received
   * Debit Cash, Credit Accounts Receivable (or Deferred Revenue)
   */
  public async recordPaymentReceived(params: {
    organizationId: string;
    amountCents: number;
    currency: BillingCurrency;
    referenceId: string;
    description: string;
  }): Promise<{ transactionId: string }> {
    return await this.recordTransaction({
      transactionId: crypto.randomUUID(),
      organizationId: params.organizationId,
      currency: params.currency,
      referenceType: 'payment',
      referenceId: params.referenceId,
      description: params.description,
      entries: [
        { accountType: 'cash', entryType: 'debit', amountCents: params.amountCents },
        { accountType: 'accounts_receivable', entryType: 'credit', amountCents: params.amountCents },
      ],
    });
  }

  /**
   * Helper: Record a refund issued
   * Debit Refund Expense, Credit Cash
   */
  public async recordRefund(params: {
    organizationId: string;
    amountCents: number;
    currency: BillingCurrency;
    referenceId: string;
    description: string;
  }): Promise<{ transactionId: string }> {
    return await this.recordTransaction({
      transactionId: crypto.randomUUID(),
      organizationId: params.organizationId,
      currency: params.currency,
      referenceType: 'refund',
      referenceId: params.referenceId,
      description: params.description,
      entries: [
        { accountType: 'refund_expense', entryType: 'debit', amountCents: params.amountCents },
        { accountType: 'cash', entryType: 'credit', amountCents: params.amountCents },
      ],
    });
  }

  /**
   * Helper: Record an direct AI operational cost
   * Debit AI Cost Expense, Credit Cash
   */
  public async recordAiCost(params: {
    organizationId: string;
    amountCents: number;
    currency: BillingCurrency;
    referenceId: string;
    description: string;
  }): Promise<{ transactionId: string }> {
    return await this.recordTransaction({
      transactionId: crypto.randomUUID(),
      organizationId: params.organizationId,
      currency: params.currency,
      referenceType: 'ai_usage',
      referenceId: params.referenceId,
      description: params.description,
      entries: [
        { accountType: 'ai_cost_expense', entryType: 'debit', amountCents: params.amountCents },
        { accountType: 'cash', entryType: 'credit', amountCents: params.amountCents },
      ],
    });
  }

  /**
   * Returns aggregated balances by account type for an organization.
   */
  public async getBalances(organizationId: string): Promise<Record<LedgerAccountType, number>> {
    const balances: Record<LedgerAccountType, number> = {
      accounts_receivable: 0,
      revenue: 0,
      cash: 0,
      deferred_revenue: 0,
      refund_expense: 0,
      bad_debt: 0,
      ai_cost_expense: 0,
    };

    let entries = FinancialLedgerService.IN_MEMORY_LEDGER.filter((e) => e.organizationId === organizationId);

    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('financial_ledger_entries')
          .select('account_type, entry_type, amount_cents')
          .eq('organization_id', organizationId);

        if (data && data.length > 0) {
          entries = data.map((d) => ({
            id: '',
            transactionId: '',
            organizationId,
            accountType: d.account_type,
            entryType: d.entry_type,
            amountCents: d.amount_cents,
            currency: 'USD',
            referenceType: 'payment',
            referenceId: '',
            description: '',
            createdAt: '',
          }));
        }
      } catch {
        // Fallback
      }
    }

    for (const e of entries) {
      // Normal balance: Assets & Expenses increase with Debit; Revenue & Liabilities increase with Credit
      if (['accounts_receivable', 'cash', 'refund_expense', 'bad_debt', 'ai_cost_expense'].includes(e.accountType)) {
        balances[e.accountType] += e.entryType === 'debit' ? e.amountCents : -e.amountCents;
      } else {
        balances[e.accountType] += e.entryType === 'credit' ? e.amountCents : -e.amountCents;
      }
    }

    return balances;
  }
}
