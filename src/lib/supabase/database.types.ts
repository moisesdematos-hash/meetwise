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
  | 'proposal'
  | 'rejected'
  | 'pending_validation';
export type MinutesReviewStatus =
  | 'draft_ai'
  | 'pending_review'
  | 'validated_human'
  | 'rejected_human'
  | 'final_signed';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type LedgerStatus = 'reserved' | 'settled' | 'cancelled' | 'refunded';
export type LedgerOperation =
  | 'transcription_minutes'
  | 'llm_extraction'
  | 'llm_chat'
  | 'storage_gb'
  | 'manual_credit';

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
          created_at: string;
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
          created_at?: string;
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
          created_at?: string;
        };
        Relationships: [];
      };

      meeting_summaries: {
        Row: {
          id: string;
          meeting_id: string;
          organization_id: string;
          executive_summary: string;
          key_points: Json; // array of strings
          topics_discussed: Json; // array of { topic, summary }
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          executive_summary: string;
          key_points?: Json;
          topics_discussed?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          executive_summary?: string;
          key_points?: Json;
          topics_discussed?: Json;
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
          review_status: MinutesReviewStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          organization_id: string;
          title: string;
          content: string;
          review_status?: MinutesReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          organization_id?: string;
          title?: string;
          content?: string;
          review_status?: MinutesReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          version?: number;
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
          created_at?: string;
        };
        Relationships: [];
      };

      plans: {
        Row: {
          id: string;
          name: string;
          code: 'free' | 'pro' | 'business' | 'enterprise';
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
          code: 'free' | 'pro' | 'business' | 'enterprise';
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
          code?: 'free' | 'pro' | 'business' | 'enterprise';
          monthly_minutes_included?: number;
          seats_included?: number;
          price_cents_usd?: number;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_id: string;
          status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan_id: string;
          status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          plan_id?: string;
          status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
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
          provider: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai';
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
          provider: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai';
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
          provider?: 'deepgram' | 'gladia' | 'gemini' | 'claude' | 'openai';
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
