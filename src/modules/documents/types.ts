import { z } from 'zod';
import type {
  DecisionClassification,
  TemplateType,
  TaskNature,
  TaskPriority,
  MinutesReviewStatus,
  ExportFormat,
  CommentStatus,
  ShareType,
  SharePermission,
} from '@/lib/supabase/database.types';

export type {
  DecisionClassification,
  TemplateType,
  TaskNature,
  TaskPriority,
  MinutesReviewStatus,
  ExportFormat,
  CommentStatus,
  ShareType,
  SharePermission,
};

// ============================================================================
// CANONICAL DOCUMENT MODEL
// ============================================================================

export interface CanonicalAttendee {
  name: string;
  role?: string;
  email?: string;
  present: boolean;
}

export interface CanonicalDiscussionItem {
  topic: string;
  summary: string;
  speaker?: string;
}

export interface CanonicalDecisionItem {
  text: string;
  classification: DecisionClassification;
  rationale?: string;
  responsible?: string;
  quote?: string;
  startTime?: number;
  endTime?: number;
}

export interface CanonicalTaskItem {
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  priority: TaskPriority;
  nature: TaskNature;
  quote?: string;
}

export interface CanonicalMeetingDocument {
  documentId: string;
  organizationId: string;
  organizationName: string;
  meetingId: string;
  documentType: 'minutes' | 'summary' | 'executive_brief';
  title: string;
  documentNumber: string; // e.g. ATA-2026-001
  meetingDate: string; // ISO string or YYYY-MM-DD
  meetingTime?: string;
  location: string;
  chairperson: string;
  secretary: string;
  attendees: CanonicalAttendee[];
  absentees: string[];
  agenda: string[];
  executiveSummary: string;
  discussions: CanonicalDiscussionItem[];
  decisions: CanonicalDecisionItem[];
  tasks: CanonicalTaskItem[];
  pendingItems: string[];
  closingNotes?: string;
  approvalStatus: MinutesReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  signedBy?: string;
  signedAt?: string;
  version: number;
  templateId?: string;
  templateType: TemplateType;
  language: string;
  generatedAt: string;
  metadata?: Record<string, any>;
}

// Zod Schema for Runtime Validation
export const CanonicalAttendeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  present: z.boolean().default(true),
});

export const CanonicalDiscussionItemSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  speaker: z.string().optional(),
});

export const CanonicalDecisionItemSchema = z.object({
  text: z.string().min(1),
  classification: z.enum([
    'approved_decision',
    'proposed_decision',
    'discussed_decision',
    'rejected_decision',
    'deferred_decision',
    'pending_validation',
    'proposal',
    'rejected',
  ]),
  rationale: z.string().optional(),
  responsible: z.string().optional(),
  quote: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
});

export const CanonicalTaskItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  nature: z.enum(['assigned', 'suggested', 'pending_confirmation']).default('assigned'),
  quote: z.string().optional(),
});

export const CanonicalDocumentSchema = z.object({
  documentId: z.string().uuid().or(z.string().min(1)),
  organizationId: z.string().uuid().or(z.string().min(1)),
  organizationName: z.string().default('MEETWISE AI Workspace'),
  meetingId: z.string().uuid().or(z.string().min(1)),
  documentType: z.enum(['minutes', 'summary', 'executive_brief']).default('minutes'),
  title: z.string().min(1),
  documentNumber: z.string().min(1),
  meetingDate: z.string().min(1),
  meetingTime: z.string().optional(),
  location: z.string().default('Virtual'),
  chairperson: z.string().default('Não informado'),
  secretary: z.string().default('Não informado'),
  attendees: z.array(CanonicalAttendeeSchema).default([]),
  absentees: z.array(z.string()).default([]),
  agenda: z.array(z.string()).default([]),
  executiveSummary: z.string().default(''),
  discussions: z.array(CanonicalDiscussionItemSchema).default([]),
  decisions: z.array(CanonicalDecisionItemSchema).default([]),
  tasks: z.array(CanonicalTaskItemSchema).default([]),
  pendingItems: z.array(z.string()).default([]),
  closingNotes: z.string().optional(),
  approvalStatus: z.enum([
    'draft_ai',
    'pending_review',
    'validated_human',
    'rejected_human',
    'final_signed',
  ]),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  signedBy: z.string().optional(),
  signedAt: z.string().optional(),
  version: z.number().int().min(1).default(1),
  templateId: z.string().optional(),
  templateType: z.enum(['formal', 'executive', 'simplified', 'custom']).default('formal'),
  language: z.string().default('pt'),
  generatedAt: z.string(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// EXPORT OPTIONS & RESULT
// ============================================================================

export interface ExportOptions {
  format: ExportFormat;
  templateType?: TemplateType;
  templateId?: string;
  language?: string;
  includeSignatures?: boolean;
  includeAuditTrail?: boolean;
  includeVerbatimQuotes?: boolean;
  customLogoUrl?: string;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  format: ExportFormat;
  sizeBytes: number;
  documentNumber: string;
  version: number;
}

// ============================================================================
// DOCUMENT VERSIONING & DIFF
// ============================================================================

export interface DocumentVersion {
  id: string;
  organizationId: string;
  meetingId: string;
  minutesId: string;
  version: number;
  title: string;
  content: string;
  sections: any[];
  reviewStatus: MinutesReviewStatus;
  documentNumber: string | null;
  changeReason: string | null;
  snapshot: CanonicalMeetingDocument;
  createdBy: string | null;
  createdAt: string;
}

export interface VersionDiff {
  oldVersion: number;
  newVersion: number;
  titleChanged: boolean;
  contentChanged: boolean;
  statusChanged: boolean;
  oldStatus?: string;
  newStatus?: string;
  addedDecisionsCount: number;
  removedDecisionsCount: number;
  addedTasksCount: number;
  removedTasksCount: number;
  summary: string;
}

// ============================================================================
// COLLABORATION & COMMENTS
// ============================================================================

export interface DocumentComment {
  id: string;
  organizationId: string;
  meetingId: string;
  minutesId: string;
  userId: string;
  authorName?: string;
  sectionId: string | null;
  content: string;
  status: CommentStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddCommentInput {
  organizationId: string;
  meetingId: string;
  minutesId: string;
  userId: string;
  authorName?: string;
  sectionId?: string | null;
  content: string;
}

// ============================================================================
// SECURE SHARING
// ============================================================================

export interface DocumentShare {
  id: string;
  organizationId: string;
  meetingId: string;
  minutesId: string;
  version: number;
  tokenHash: string;
  recipientEmail: string | null;
  shareType: ShareType;
  permissions: SharePermission;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  createdBy: string;
  accessCount: number;
  maxAccesses: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShareInput {
  organizationId: string;
  meetingId: string;
  minutesId: string;
  version: number;
  createdBy: string;
  shareType: ShareType;
  permissions?: SharePermission;
  recipientEmail?: string | null;
  expiresInHours?: number; // default 72h
  maxAccesses?: number | null;
}

export interface ShareVerificationResult {
  valid: boolean;
  share?: DocumentShare;
  reason?: 'expired' | 'revoked' | 'max_access_reached' | 'not_found';
}

// ============================================================================
// AUDIT EVENT
// ============================================================================

export interface DocumentAuditEvent {
  organizationId: string;
  userId?: string | null;
  action:
    | 'document_created'
    | 'document_edited'
    | 'document_version_created'
    | 'review_requested'
    | 'reviewer_assigned'
    | 'comment_added'
    | 'comment_resolved'
    | 'document_approved'
    | 'document_finalized'
    | 'document_exported'
    | 'document_shared'
    | 'share_revoked'
    | 'share_accessed';
  resourceId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export interface IDocxExportService {
  exportToDocx(document: CanonicalMeetingDocument, options?: ExportOptions): Promise<Buffer>;
}

export interface IPdfExportService {
  exportToPdf(document: CanonicalMeetingDocument, options?: ExportOptions): Promise<Buffer>;
}

export interface ITextExportService {
  exportToText(document: CanonicalMeetingDocument, options?: ExportOptions): string;
}

export interface IDocumentGenerationService {
  generateExport(document: CanonicalMeetingDocument, options: ExportOptions): Promise<ExportResult>;
}

export interface IDocumentNumberingService {
  getNextNumber(orgId: string, year?: number, prefix?: string): Promise<string>;
}

export interface IDocumentVersionService {
  createVersionSnapshot(params: {
    organizationId: string;
    meetingId: string;
    minutesId: string;
    version: number;
    title: string;
    content: string;
    sections?: any[];
    reviewStatus: MinutesReviewStatus;
    documentNumber?: string;
    changeReason?: string;
    snapshot: CanonicalMeetingDocument;
    createdBy?: string;
  }): Promise<DocumentVersion>;
  getVersions(minutesId: string): Promise<DocumentVersion[]>;
  compareVersions(v1: CanonicalMeetingDocument, v2: CanonicalMeetingDocument): VersionDiff;
  assertVersionMatch(currentVersion: number, expectedVersion: number): void;
}

export interface ICollaborationService {
  addComment(input: AddCommentInput): Promise<DocumentComment>;
  resolveComment(commentId: string, resolvedBy: string): Promise<void>;
  rejectComment(commentId: string, resolvedBy: string): Promise<void>;
  getComments(minutesId: string): Promise<DocumentComment[]>;
  assignReviewer(minutesId: string, reviewerId: string, requestedBy: string): Promise<void>;
}

export interface IDocumentSharingService {
  createShare(input: CreateShareInput): Promise<{ share: DocumentShare; rawToken: string; shareUrl: string }>;
  verifyShare(rawToken: string): Promise<ShareVerificationResult>;
  revokeShare(shareId: string, revokedBy: string): Promise<void>;
  recordAccess(tokenHash: string): Promise<void>;
}

export interface IDocumentAuditService {
  logDocumentEvent(event: DocumentAuditEvent): Promise<void>;
}
