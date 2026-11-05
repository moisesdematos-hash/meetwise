export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrganizationRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'suspended' | 'invited';
export type MeetingStatus =
  | 'created'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'archived';
export type JobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type DecisionClassification =
  | 'approved_decision'
  | 'proposed_decision'
  | 'discussed_decision'
  | 'rejected_decision'
  | 'deferred_decision'
  | 'pending_validation'
  | 'proposal'
  | 'rejected';
export type TemplateType = 'formal' | 'executive' | 'simplified' | 'custom';
export type TaskNature = 'assigned' | 'suggested' | 'pending_confirmation';
export type ExportFormat = 'docx' | 'pdf' | 'txt';
export type DocumentExportStatus = 'not_exported' | 'exported' | 'pending';
export type CommentStatus = 'open' | 'resolved' | 'rejected';
export type ShareType = 'internal' | 'external_link';
export type SharePermission = 'view' | 'comment';
export type MinutesReviewStatus =
  | 'draft_ai'
  | 'pending_review'
  | 'validated_human'
  | 'rejected_human'
  | 'final_signed';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TranscriptionReviewStatus = 'draft' | 'in_review' | 'validated';
export type LedgerStatus = 'reserved' | 'settled' | 'cancelled' | 'refunded';
export type LedgerOperation =
  | 'transcription_minutes'
  | 'llm_extraction'
  | 'llm_chat'
  | 'storage_gb'
  | 'manual_credit';

export type PlanCode = 'free' | 'starter' | 'pro' | 'business' | 'enterprise';
export type BillingCurrency = 'AOA' | 'USD' | 'EUR' | 'BRL';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace_period'
  | 'suspended'
  | 'cancelled'
  | 'canceled'
  | 'unpaid'
  | 'expired';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void' | 'refunded';
export type LedgerAccountType =
  | 'accounts_receivable'
  | 'revenue'
  | 'cash'
  | 'deferred_revenue'
  | 'refund_expense'
  | 'bad_debt'
  | 'ai_cost_expense';
export type LedgerEntryType = 'debit' | 'credit';
export type LedgerReferenceType =
  | 'invoice'
  | 'payment'
  | 'refund'
  | 'ai_usage'
  | 'manual_adjustment';
export type RefundStatus = 'pending' | 'approved' | 'processed' | 'failed' | 'rejected';
export type PlatformAdminRole = 'super_admin' | 'billing_admin' | 'support_admin';
export type CheckoutSessionStatus = 'open' | 'completed' | 'expired' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; // references auth.users
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string;
          default_language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_by: string;
          default_language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_by?: string;
          default_language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          status: MemberStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrganizationRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrganizationRole;
          invited_by: string;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: OrganizationRole;
          invited_by: string;
          token: string;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: OrganizationRole;
          invited_by?: string;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      meetings: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          title: string;
          description: string | null;
          scheduled_at: string;
          language: string;
          status: MeetingStatus;
          duration_seconds: number | null;
          transcription_review_status: TranscriptionReviewStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by: string;
          title: string;
          description?: string | null;
          scheduled_at?: string;
          language?: string;
          status?: MeetingStatus;
          duration_seconds?: number | null;
          transcription_review_status?: TranscriptionReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string;
          title?: string;
          description?: string | null;
          scheduled_at?: string;
          language?: string;
          status?: MeetingStatus;
          duration_seconds?: number | null;
          transcription_review_status?: TranscriptionReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_participants: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          name: string;
          email: string | null;
          speaker_label: string | null; // e.g. "Speaker 0"
          is_present: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          name: string;
          email?: string | null;
          speaker_label?: string | null;
          is_present?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          name?: string;
          email?: string | null;
          speaker_label?: string | null;
          is_present?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      media_assets: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size_bytes: number;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size_bytes: number;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          storage_bucket?: string;
          storage_path?: string;
          original_filename?: string;
          mime_type?: string;
          file_size_bytes?: number;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      processing_jobs: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string;
          operation: string; // e.g. "transcription", "minutes_extraction"
          status: JobStatus;
          idempotency_key: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id: string;
          operation: string;
          status?: JobStatus;
          idempotency_key: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string;
          operation?: string;
          status?: JobStatus;
          idempotency_key?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };

      transcript_segments: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          speaker_label: string;
          start_time: number; // in seconds
          end_time: number;
          text: string;
          words: Json; // array of { word, start, end, confidence }
          confidence: number;
          is_edited: boolean;
          original_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          speaker_label: string;
          start_time: number;
          end_time: number;
          text: string;
          words?: Json;
          confidence?: number;
          is_edited?: boolean;
          original_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          speaker_label?: string;
          start_time?: number;
          end_time?: number;
          text?: string;
          words?: Json;
          confidence?: number;
          is_edited?: boolean;
          original_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_summaries: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          executive_summary: string;
          brief_summary: string | null;
          detailed_summary: string | null;
          key_points: Json; // array of strings
          topics_discussed: Json; // array of { topic, summary }
          next_steps: Json;
          risks: Json;
          generated_by_model: string | null;
          prompt_tokens: number;
          completion_tokens: number;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          executive_summary: string;
          brief_summary?: string | null;
          detailed_summary?: string | null;
          key_points?: Json;
          topics_discussed?: Json;
          next_steps?: Json;
          risks?: Json;
          generated_by_model?: string | null;
          prompt_tokens?: number;
          completion_tokens?: number;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          executive_summary?: string;
          brief_summary?: string | null;
          detailed_summary?: string | null;
          key_points?: Json;
          topics_discussed?: Json;
          next_steps?: Json;
          risks?: Json;
          generated_by_model?: string | null;
          prompt_tokens?: number;
          completion_tokens?: number;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_minutes: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          title: string;
          content: string; // Markdown / Structured text
          template_type: TemplateType;
          template_id: string | null;
          sections: Json;
          language: string;
          metadata: Json;
          review_status: MinutesReviewStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          version: number;
          document_number: string | null;
          assigned_reviewer_id: string | null;
          review_requested_at: string | null;
          review_requested_by: string | null;
          signed_by_name: string | null;
          signed_at: string | null;
          export_status: DocumentExportStatus;
          last_exported_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          title: string;
          content: string;
          template_type?: TemplateType;
          template_id?: string | null;
          sections?: Json;
          language?: string;
          metadata?: Json;
          review_status?: MinutesReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          version?: number;
          document_number?: string | null;
          assigned_reviewer_id?: string | null;
          review_requested_at?: string | null;
          review_requested_by?: string | null;
          signed_by_name?: string | null;
          signed_at?: string | null;
          export_status?: DocumentExportStatus;
          last_exported_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          title?: string;
          content?: string;
          template_type?: TemplateType;
          template_id?: string | null;
          sections?: Json;
          language?: string;
          metadata?: Json;
          review_status?: MinutesReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          version?: number;
          document_number?: string | null;
          assigned_reviewer_id?: string | null;
          review_requested_at?: string | null;
          review_requested_by?: string | null;
          signed_by_name?: string | null;
          signed_at?: string | null;
          export_status?: DocumentExportStatus;
          last_exported_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_decisions: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          segment_id: string | null;
          start_time: number | null;
          end_time: number | null;
          quote: string | null; // Verbatim quote from transcript
          decision_text: string;
          classification: DecisionClassification;
          confidence_score: number;
          rationale: string | null;
          responsible_name: string | null;
          status_evidence: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          segment_id?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          quote?: string | null;
          decision_text: string;
          classification?: DecisionClassification;
          confidence_score?: number;
          rationale?: string | null;
          responsible_name?: string | null;
          status_evidence?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          segment_id?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          quote?: string | null;
          decision_text?: string;
          classification?: DecisionClassification;
          confidence_score?: number;
          rationale?: string | null;
          responsible_name?: string | null;
          status_evidence?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_tasks: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          segment_id: string | null;
          start_time: number | null;
          end_time: number | null;
          quote: string | null;
          title: string;
          description: string | null;
          assignee_name: string | null;
          assignee_user_id: string | null;
          due_date: string | null;
          priority: TaskPriority;
          status: TaskStatus;
          task_nature: TaskNature;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          segment_id?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          quote?: string | null;
          title: string;
          description?: string | null;
          assignee_name?: string | null;
          assignee_user_id?: string | null;
          due_date?: string | null;
          priority?: TaskPriority;
          status?: TaskStatus;
          task_nature?: TaskNature;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          segment_id?: string | null;
          start_time?: number | null;
          end_time?: number | null;
          quote?: string | null;
          title?: string;
          description?: string | null;
          assignee_name?: string | null;
          assignee_user_id?: string | null;
          due_date?: string | null;
          priority?: TaskPriority;
          status?: TaskStatus;
          task_nature?: TaskNature;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organization_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          template_type: TemplateType;
          sections: Json;
          terminology: Json;
          language: string;
          formatting_rules: Json;
          is_default: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          template_type?: TemplateType;
          sections?: Json;
          terminology?: Json;
          language?: string;
          formatting_rules?: Json;
          is_default?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          template_type?: TemplateType;
          sections?: Json;
          terminology?: Json;
          language?: string;
          formatting_rules?: Json;
          is_default?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_documents: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          doc_type: 'pdf' | 'docx' | 'txt';
          storage_bucket: string;
          storage_path: string;
          filename: string;
          file_size_bytes: number;
          minutes_id: string | null;
          version: number;
          template_type: TemplateType;
          template_id: string | null;
          status: 'queued' | 'processing' | 'completed' | 'failed';
          metadata: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          doc_type: 'pdf' | 'docx' | 'txt';
          storage_bucket: string;
          storage_path: string;
          filename: string;
          file_size_bytes: number;
          minutes_id?: string | null;
          version?: number;
          template_type?: TemplateType;
          template_id?: string | null;
          status?: 'queued' | 'processing' | 'completed' | 'failed';
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          doc_type?: 'pdf' | 'docx' | 'txt';
          storage_bucket?: string;
          storage_path?: string;
          filename?: string;
          file_size_bytes?: number;
          minutes_id?: string | null;
          version?: number;
          template_type?: TemplateType;
          template_id?: string | null;
          status?: 'queued' | 'processing' | 'completed' | 'failed';
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      organization_document_sequences: {
        Row: {
          id: string;
          organization_id: string;
          prefix: string;
          year: number;
          last_number: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          prefix?: string;
          year?: number;
          last_number?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          prefix?: string;
          year?: number;
          last_number?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_document_versions: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          version: number;
          title: string;
          content: string;
          sections: Json;
          review_status: string;
          document_number: string | null;
          change_reason: string | null;
          snapshot: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          version: number;
          title: string;
          content: string;
          sections?: Json;
          review_status: string;
          document_number?: string | null;
          change_reason?: string | null;
          snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string;
          minutes_id?: string;
          version?: number;
          title?: string;
          content?: string;
          sections?: Json;
          review_status?: string;
          document_number?: string | null;
          change_reason?: string | null;
          snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      meeting_document_comments: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          user_id: string;
          section_id: string | null;
          content: string;
          status: CommentStatus;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          user_id: string;
          section_id?: string | null;
          content: string;
          status?: CommentStatus;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string;
          minutes_id?: string;
          user_id?: string;
          section_id?: string | null;
          content?: string;
          status?: CommentStatus;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meeting_document_shares: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          version: number;
          token_hash: string;
          recipient_email: string | null;
          share_type: ShareType;
          permissions: SharePermission;
          expires_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
          created_by: string;
          access_count: number;
          max_accesses: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id: string;
          minutes_id: string;
          version?: number;
          token_hash: string;
          recipient_email?: string | null;
          share_type?: ShareType;
          permissions?: SharePermission;
          expires_at: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_by: string;
          access_count?: number;
          max_accesses?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string;
          minutes_id?: string;
          version?: number;
          token_hash?: string;
          recipient_email?: string | null;
          share_type?: ShareType;
          permissions?: SharePermission;
          expires_at?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_by?: string;
          access_count?: number;
          max_accesses?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      plans: {
        Row: {
          id: string;
          name: string;
          code: PlanCode;
          monthly_minutes_included: number;
          seats_included: number;
          price_cents_usd: number;
          features: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: PlanCode;
          monthly_minutes_included: number;
          seats_included: number;
          price_cents_usd: number;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: PlanCode;
          monthly_minutes_included?: number;
          seats_included?: number;
          price_cents_usd?: number;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      plan_prices: {
        Row: {
          id: string;
          plan_id: string;
          currency: BillingCurrency;
          amount_cents: number;
          billing_interval: BillingInterval;
          version: number;
          is_active: boolean;
          effective_from: string;
          effective_until: string | null;
          external_price_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          currency: BillingCurrency;
          amount_cents: number;
          billing_interval: BillingInterval;
          version?: number;
          is_active?: boolean;
          effective_from?: string;
          effective_until?: string | null;
          external_price_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          currency?: BillingCurrency;
          amount_cents?: number;
          billing_interval?: BillingInterval;
          version?: number;
          is_active?: boolean;
          effective_from?: string;
          effective_until?: string | null;
          external_price_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_id: string;
          plan_price_id: string | null;
          status: SubscriptionStatus;
          currency: BillingCurrency;
          billing_interval: BillingInterval;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          grace_period_ends_at: string | null;
          suspended_at: string | null;
          suspended_reason: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          external_subscription_id: string | null;
          provider: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan_id: string;
          plan_price_id?: string | null;
          status?: SubscriptionStatus;
          currency?: BillingCurrency;
          billing_interval?: BillingInterval;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end?: boolean;
          grace_period_ends_at?: string | null;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          external_subscription_id?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          plan_id?: string;
          plan_price_id?: string | null;
          status?: SubscriptionStatus;
          currency?: BillingCurrency;
          billing_interval?: BillingInterval;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          grace_period_ends_at?: string | null;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          external_subscription_id?: string | null;
          provider?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      usage_ledger: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string | null;
          operation: LedgerOperation;
          quantity: number; // e.g. minutes or tokens
          unit: string; // "minutes", "tokens", "credits"
          cost_cents_usd: number;
          idempotency_key: string;
          status: LedgerStatus;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id?: string | null;
          operation: LedgerOperation;
          quantity: number;
          unit: string;
          cost_cents_usd?: number;
          idempotency_key: string;
          status?: LedgerStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string | null;
          operation?: LedgerOperation;
          quantity?: number;
          unit?: string;
          cost_cents_usd?: number;
          idempotency_key?: string;
          status?: LedgerStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payment_events: {
        Row: {
          id: string;
          organization_id: string;
          provider: string; // e.g. "stripe"
          external_event_id: string;
          event_type: string;
          amount_cents: number;
          currency: string;
          status: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          external_event_id: string;
          event_type: string;
          amount_cents: number;
          currency: string;
          status: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string;
          external_event_id?: string;
          event_type?: string;
          amount_cents?: number;
          currency?: string;
          status?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      ai_provider_requests: {
        Row: {
          id: string;
          organization_id: string;
          meeting_id: string | null;
          provider: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai' | 'mock';
          endpoint: string;
          request_id: string | null;
          status_code: number;
          duration_ms: number;
          tokens_in: number | null;
          tokens_out: number | null;
          audio_duration_seconds: number | null;
          cost_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          meeting_id?: string | null;
          provider: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai' | 'mock';
          endpoint: string;
          request_id?: string | null;
          status_code: number;
          duration_ms: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
          audio_duration_seconds?: number | null;
          cost_usd?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          meeting_id?: string | null;
          provider?: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai' | 'mock';
          endpoint?: string;
          request_id?: string | null;
          status_code?: number;
          duration_ms?: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
          audio_duration_seconds?: number | null;
          cost_usd?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      checkout_sessions: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          plan_id: string;
          plan_price_id: string;
          provider: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
          currency: BillingCurrency;
          amount_cents: number;
          billing_interval: BillingInterval;
          status: CheckoutSessionStatus;
          session_reference: string;
          provider_checkout_id: string | null;
          provider_url: string | null;
          success_url: string;
          cancel_url: string;
          expires_at: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          plan_id: string;
          plan_price_id: string;
          provider: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
          currency: BillingCurrency;
          amount_cents: number;
          billing_interval: BillingInterval;
          status?: CheckoutSessionStatus;
          session_reference: string;
          provider_checkout_id?: string | null;
          provider_url?: string | null;
          success_url: string;
          cancel_url: string;
          expires_at: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          plan_id?: string;
          plan_price_id?: string;
          provider?: 'stripe' | 'mock' | 'multicaixa' | 'paypal';
          currency?: BillingCurrency;
          amount_cents?: number;
          billing_interval?: BillingInterval;
          status?: CheckoutSessionStatus;
          session_reference?: string;
          provider_checkout_id?: string | null;
          provider_url?: string | null;
          success_url?: string;
          cancel_url?: string;
          expires_at?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      invoices: {
        Row: {
          id: string;
          organization_id: string;
          subscription_id: string | null;
          invoice_number: string;
          currency: BillingCurrency;
          subtotal_cents: number;
          tax_cents: number;
          total_cents: number;
          status: InvoiceStatus;
          due_date: string;
          paid_at: string | null;
          payment_reference: string | null;
          billing_details: Json;
          pdf_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          subscription_id?: string | null;
          invoice_number: string;
          currency: BillingCurrency;
          subtotal_cents: number;
          tax_cents?: number;
          total_cents: number;
          status?: InvoiceStatus;
          due_date: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          billing_details?: Json;
          pdf_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          subscription_id?: string | null;
          invoice_number?: string;
          currency?: BillingCurrency;
          subtotal_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          status?: InvoiceStatus;
          due_date?: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          billing_details?: Json;
          pdf_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      invoice_lines: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price_cents: number;
          total_price_cents: number;
          period_start: string | null;
          period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          description: string;
          quantity?: number;
          unit_price_cents: number;
          total_price_cents: number;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          description?: string;
          quantity?: number;
          unit_price_cents?: number;
          total_price_cents?: number;
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      financial_ledger_entries: {
        Row: {
          id: string;
          transaction_id: string;
          organization_id: string;
          account_type: LedgerAccountType;
          entry_type: LedgerEntryType;
          amount_cents: number;
          currency: BillingCurrency;
          reference_type: LedgerReferenceType;
          reference_id: string;
          description: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          organization_id: string;
          account_type: LedgerAccountType;
          entry_type: LedgerEntryType;
          amount_cents: number;
          currency: BillingCurrency;
          reference_type: LedgerReferenceType;
          reference_id: string;
          description: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          organization_id?: string;
          account_type?: LedgerAccountType;
          entry_type?: LedgerEntryType;
          amount_cents?: number;
          currency?: BillingCurrency;
          reference_type?: LedgerReferenceType;
          reference_id?: string;
          description?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      refunds: {
        Row: {
          id: string;
          organization_id: string;
          invoice_id: string | null;
          payment_event_id: string | null;
          amount_cents: number;
          currency: BillingCurrency;
          reason: string;
          status: RefundStatus;
          external_refund_id: string | null;
          processed_by: string | null;
          metadata: Json;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_id?: string | null;
          payment_event_id?: string | null;
          amount_cents: number;
          currency: BillingCurrency;
          reason: string;
          status?: RefundStatus;
          external_refund_id?: string | null;
          processed_by?: string | null;
          metadata?: Json;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          invoice_id?: string | null;
          payment_event_id?: string | null;
          amount_cents?: number;
          currency?: BillingCurrency;
          reason?: string;
          status?: RefundStatus;
          external_refund_id?: string | null;
          processed_by?: string | null;
          metadata?: Json;
          created_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };

      platform_admins: {
        Row: {
          id: string;
          user_id: string;
          role: PlatformAdminRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: PlatformAdminRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: PlatformAdminRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      organization_quota_reserves: {
        Row: {
          id: string;
          organization_id: string;
          operation: string;
          reserved_quantity: number;
          unit: string;
          idempotency_key: string;
          status: 'active' | 'settled' | 'released';
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          operation: string;
          reserved_quantity: number;
          unit?: string;
          idempotency_key: string;
          status?: 'active' | 'settled' | 'released';
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          operation?: string;
          reserved_quantity?: number;
          unit?: string;
          idempotency_key?: string;
          status?: 'active' | 'settled' | 'released';
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
