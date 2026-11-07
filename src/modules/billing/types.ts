import { z } from 'zod';
import type {
  PlanCode,
  BillingCurrency,
  BillingInterval,
  SubscriptionStatus,
  InvoiceStatus,
  LedgerOperation,
  LedgerStatus,
  LedgerAccountType,
  LedgerEntryType,
  LedgerReferenceType,
  RefundStatus,
  PlatformAdminRole,
  CheckoutSessionStatus,
} from '@/lib/supabase/database.types';

// ============================================================================
// 1. BACKWARDS COMPATIBILITY FOR PREVIOUS PHASES & TESTS
// ============================================================================

export interface QuotaReservationParams {
  organizationId: string;
  meetingId?: string;
  operation: LedgerOperation;
  estimatedQuantity: number;
  unit: string;
  idempotencyKey: string;
}

export interface QuotaSettlementParams {
  idempotencyKey: string;
  actualQuantity: number;
  costCentsUsd?: number;
}

export interface IUsageLedgerService {
  reserveQuota(params: QuotaReservationParams): Promise<{ reservationId: string; reservedQuantity: number }>;
  settleQuota(params: QuotaSettlementParams): Promise<{ ledgerId: string; settledQuantity: number }>;
  releaseQuota(idempotencyKey: string, reason?: string): Promise<void>;
  getOrganizationBalance(organizationId: string): Promise<{ usedMinutes: number; totalMinutesLimit: number; remainingMinutes: number }>;
}

export const PLAN_LIMITS = {
  free: {
    monthlyMinutes: 45,
    seatsIncluded: 1,
    priceCentsUsd: 0,
  },
  starter: {
    monthlyMinutes: 180,
    seatsIncluded: 1,
    priceCentsUsd: 900,
  },
  pro: {
    monthlyMinutes: 600,
    seatsIncluded: 1,
    priceCentsUsd: 1900,
  },
  business: {
    monthlyMinutes: 2500,
    seatsIncluded: 5,
    priceCentsUsd: 7900,
  },
  enterprise: {
    monthlyMinutes: 10000,
    seatsIncluded: 50,
    priceCentsUsd: 29900,
  },
} as const;

export function calculateEstimatedMinutesCost(minutes: number): number {
  // $0.0050 per minute (STT + LLM + Storage) = 0.5 cents per minute
  return Math.ceil(minutes * 0.5);
}

// ============================================================================
// 2. DOMAIN MODELS & SCHEMAS
// ============================================================================

export interface PlanFeatureSet {
  stt: 'basic' | 'deepgram' | 'gladia' | 'premium';
  minutes: boolean;
  diarization?: boolean;
  chat?: boolean;
  team_sharing?: boolean;
  custom_retention?: boolean;
  sla?: boolean;
  export: ('txt' | 'pdf' | 'docx')[];
  max_file_size_mb?: number;
}

export interface CommercialPlan {
  id: string;
  name: string;
  code: PlanCode;
  monthlyMinutesIncluded: number;
  seatsIncluded: number;
  features: PlanFeatureSet;
  isActive: boolean;
  prices: PlanPriceItem[];
}

export interface PlanPriceItem {
  id: string;
  planId: string;
  currency: BillingCurrency;
  amountCents: number; // Stored in minor units (integer cents/cêntimos)
  billingInterval: BillingInterval;
  version: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  externalPriceId: string | null;
}

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  planId: string;
  planPriceId: string | null;
  status: SubscriptionStatus;
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  gracePeriodEndsAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  externalSubscriptionId: string | null;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutSessionData {
  id: string;
  organizationId: string;
  userId: string;
  planId: string;
  planPriceId: string;
  provider: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
  currency: BillingCurrency;
  amountCents: number;
  billingInterval: BillingInterval;
  status: CheckoutSessionStatus;
  sessionReference: string;
  providerCheckoutId: string | null;
  providerUrl: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  metadata: Record<string, unknown>;
}

export interface InvoiceRecord {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  invoiceNumber: string; // e.g. FAT-2026-0001
  currency: BillingCurrency;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  paymentReference: string | null;
  billingDetails: Record<string, unknown>;
  pdfUrl: string | null;
  lines: InvoiceLineRecord[];
  createdAt: string;
}

export interface InvoiceLineRecord {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface DoubleEntryTransaction {
  transactionId: string;
  organizationId: string;
  currency: BillingCurrency;
  referenceType: LedgerReferenceType;
  referenceId: string;
  description: string;
  createdBy?: string;
  entries: {
    accountType: LedgerAccountType;
    entryType: LedgerEntryType;
    amountCents: number;
  }[];
}

export interface RefundRecord {
  id: string;
  organizationId: string;
  invoiceId: string | null;
  paymentEventId: string | null;
  amountCents: number;
  currency: BillingCurrency;
  reason: string;
  status: RefundStatus;
  externalRefundId: string | null;
  processedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  processedAt: string | null;
}

// ============================================================================
// 3. SERVICE INTERFACES (Section 3 of Prompt)
// ============================================================================

export interface IBillingService {
  getCatalog(currency?: BillingCurrency): Promise<CommercialPlan[]>;
  getPlanByCode(code: PlanCode): Promise<CommercialPlan>;
  getPlanPrice(planId: string, currency: BillingCurrency, interval: BillingInterval): Promise<PlanPriceItem>;
}

export interface ISubscriptionService {
  getSubscription(organizationId: string): Promise<SubscriptionRecord | null>;
  createSubscription(params: {
    organizationId: string;
    planId: string;
    planPriceId: string;
    provider?: string;
    externalSubscriptionId?: string;
  }): Promise<SubscriptionRecord>;
  transitionStatus(subscriptionId: string, newStatus: SubscriptionStatus, reason?: string): Promise<SubscriptionRecord>;
  cancelSubscription(subscriptionId: string, reason?: string, immediate?: boolean): Promise<SubscriptionRecord>;
  reactivateSubscription(subscriptionId: string): Promise<SubscriptionRecord>;
  upgradePlan(subscriptionId: string, newPlanPriceId: string): Promise<SubscriptionRecord>;
}

export interface CheckoutIntentParams {
  organizationId: string;
  userId: string;
  planCode: PlanCode;
  currency: BillingCurrency;
  interval: BillingInterval;
  provider: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
  successUrl: string;
  cancelUrl: string;
}

export interface ICheckoutService {
  createSession(params: CheckoutIntentParams): Promise<CheckoutSessionData>;
  getSession(sessionReference: string): Promise<CheckoutSessionData | null>;
  expireSession(sessionReference: string): Promise<void>;
}

export interface IPaymentProvider {
  id: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
  name: string;
  supportedCurrencies: BillingCurrency[];
  isAvailableForCountry(countryCode: string): boolean;
  createCheckoutIntent(session: CheckoutSessionData): Promise<{ externalId: string; checkoutUrl: string }>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean>;
  processRefund(params: { externalPaymentId: string; amountCents: number; reason: string }): Promise<{ externalRefundId: string; status: 'processed' | 'failed' }>;
}

export interface IWebhookService {
  processWebhookEvent(params: {
    provider: string;
    rawPayload: string;
    signature: string;
    eventId?: string;
  }): Promise<{ status: 'processed' | 'ignored' | 'failed'; message: string }>;
}

export interface IInvoiceService {
  createInvoice(params: {
    organizationId: string;
    subscriptionId?: string;
    currency: BillingCurrency;
    lines: { description: string; quantity: number; unitPriceCents: number }[];
    dueDate?: string;
    billingDetails?: Record<string, unknown>;
  }): Promise<InvoiceRecord>;
  getInvoice(invoiceId: string): Promise<InvoiceRecord | null>;
  listOrganizationInvoices(organizationId: string): Promise<InvoiceRecord[]>;
  markInvoicePaid(invoiceId: string, paymentReference: string): Promise<InvoiceRecord>;
}

export interface IEntitlementService {
  checkEntitlement(organizationId: string, featureKey: keyof PlanFeatureSet): Promise<boolean>;
  getOrganizationPlanLimits(organizationId: string): Promise<{ monthlyMinutes: number; seats: number; features: PlanFeatureSet }>;
}

export interface IUsageMeteringService {
  recordUsage(params: {
    organizationId: string;
    meetingId?: string;
    operation: LedgerOperation;
    quantity: number;
    unit: string;
    idempotencyKey: string;
    costCentsUsd?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; recorded: boolean }>;
}

export interface IQuotaService {
  reserveMinutes(params: {
    organizationId: string;
    minutes: number;
    idempotencyKey: string;
  }): Promise<{ reserved: boolean; reservationId: string; remainingMinutes: number }>;
  settleMinutes(params: {
    idempotencyKey: string;
    actualMinutes: number;
    meetingId?: string;
    reservationId?: string;
  }): Promise<{ settled: boolean; settledMinutes: number }>;
  releaseMinutes(params: {
    idempotencyKey: string;
    reservationId?: string;
    reason?: string;
  }): Promise<void>;
  checkQuotaAvailability(organizationId: string, requestedMinutes: number): Promise<{ available: boolean; remainingMinutes: number }>;
}

export interface ICostAccountingService {
  recordAiCall(params: {
    organizationId: string;
    meetingId?: string;
    provider: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai' | 'mock';
    endpoint: string;
    durationMs: number;
    tokensIn?: number;
    tokensOut?: number;
    audioDurationSeconds?: number;
    estimatedCostUsd: number;
    statusCode: number;
  }): Promise<void>;
  getOrganizationDirectCosts(organizationId: string, periodStart: string, periodEnd: string): Promise<{ totalCostUsd: number; breakdown: Record<string, number> }>;
}

export interface IRevenueReportingService {
  calculateGrossMargin(params: { revenueUsd: number; directCostsUsd: number }): { grossMarginPercentage: number; grossProfitUsd: number; alertTriggered: boolean };
  getFinancialSummary(organizationId?: string): Promise<{
    mrrUsd: number;
    arrUsd: number;
    directCostsUsd: number;
    grossMarginPercentage: number;
    activeSubscriptions: number;
    churnRatePercentage: number;
  }>;
}

export interface IAdminService {
  getPlatformMetrics(): Promise<{
    totalOrganizations: number;
    activeSubscriptions: number;
    totalRevenueUsd: number;
    directCostsUsd: number;
    grossMarginPercentage: number;
    failedJobsCount: number;
  }>;
  listAllOrganizations(limit?: number, offset?: number): Promise<{ id: string; name: string; planCode: PlanCode; subscriptionStatus: SubscriptionStatus }[]>;
  applyManualAdjustment(params: {
    organizationId: string;
    adminUserId: string;
    action: 'add_minutes' | 'grant_credit' | 'override_plan' | 'suspend';
    value: number | string;
    justification: string;
  }): Promise<{ success: boolean; auditLogId: string }>;
}

export interface IRefundService {
  requestRefund(params: {
    organizationId: string;
    invoiceId: string;
    amountCents: number;
    reason: string;
    requestedBy: string;
  }): Promise<RefundRecord>;
  processRefund(refundId: string, approvedBy: string): Promise<RefundRecord>;
}
