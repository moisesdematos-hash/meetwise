import { describe, it, expect } from 'vitest';
import { FinancialLedgerService } from '@/modules/billing/financial-ledger-service';

describe('Phase 6 — Double-Entry Financial Ledger', () => {
  const ledgerService = new FinancialLedgerService();
  const orgId = 'org-ledger-test-uuid';

  it('should enforce double-entry equality (Debits == Credits) and reject unbalanced transactions', async () => {
    // Unbalanced: Debit 1000, Credit 800
    await expect(
      ledgerService.recordTransaction({
        transactionId: 'tx-fail',
        organizationId: orgId,
        currency: 'USD',
        referenceType: 'manual_adjustment',
        referenceId: 'adj-1',
        description: 'Unbalanced adjustment test',
        entries: [
          { accountType: 'cash', entryType: 'debit', amountCents: 1000 },
          { accountType: 'revenue', entryType: 'credit', amountCents: 800 },
        ],
      })
    ).rejects.toThrow();
  });

  it('should accept balanced transactions and update account balances accurately', async () => {
    // 1. Invoice Issued: Debit AR 5000, Credit Revenue 5000
    const invTx = await ledgerService.recordInvoiceIssued({
      organizationId: orgId,
      invoiceId: 'inv-test-101',
      amountCents: 5000,
      currency: 'USD',
      description: 'Invoice 101 Issued',
    });
    expect(invTx.transactionId).toBeDefined();

    let balances = await ledgerService.getBalances(orgId);
    expect(balances.accounts_receivable).toBe(5000);
    expect(balances.revenue).toBe(5000);
    expect(balances.cash).toBe(0);

    // 2. Payment Received: Debit Cash 5000, Credit AR 5000
    const payTx = await ledgerService.recordPaymentReceived({
      organizationId: orgId,
      amountCents: 5000,
      currency: 'USD',
      referenceId: 'pay-test-101',
      description: 'Payment for Invoice 101',
    });
    expect(payTx.transactionId).toBeDefined();

    balances = await ledgerService.getBalances(orgId);
    expect(balances.accounts_receivable).toBe(0); // Cleared
    expect(balances.revenue).toBe(5000);
    expect(balances.cash).toBe(5000);
  });

  it('should record compensatory refund transactions (Debit Refund Expense, Credit Cash)', async () => {
    const refundTx = await ledgerService.recordRefund({
      organizationId: orgId,
      amountCents: 2000,
      currency: 'USD',
      referenceId: 'ref-test-01',
      description: 'Partial refund',
    });
    expect(refundTx.transactionId).toBeDefined();

    const balances = await ledgerService.getBalances(orgId);
    expect(balances.refund_expense).toBe(2000);
    expect(balances.cash).toBe(3000); // 5000 - 2000
  });
});
