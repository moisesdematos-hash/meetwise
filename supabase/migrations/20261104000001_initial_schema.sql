-- ==============================================================================
-- MEETWISE AI — Initial Relational Schema
-- Migration: 20261104000001_initial_schema.sql
-- Description: Creates 20 foundational tables with foreign keys, constraints,
--              audit timestamps, and optimized indexes.
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. PROFILES (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'pt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  default_language TEXT NOT NULL DEFAULT 'pt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. ORGANIZATION MEMBERS
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);

CREATE TRIGGER trg_org_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. ORGANIZATION INVITATIONS
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invitation_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_org_invitations_token ON public.organization_invitations(token);
CREATE INDEX idx_org_invitations_org_email ON public.organization_invitations(organization_id, email);

-- 5. MEETINGS
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  language TEXT NOT NULL DEFAULT 'pt',
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'queued', 'processing', 'completed', 'failed', 'cancelled', 'archived')
  ),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_org_status ON public.meetings(organization_id, status);
CREATE INDEX idx_meetings_scheduled_at ON public.meetings(organization_id, scheduled_at DESC);

CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. MEETING PARTICIPANTS
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  speaker_label TEXT,
  is_present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_participants_meeting ON public.meeting_participants(meeting_id);
CREATE INDEX idx_participants_org ON public.meeting_participants(organization_id);

-- 7. MEDIA ASSETS
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 524288000), -- max 500MB
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_meeting ON public.media_assets(meeting_id);
CREATE INDEX idx_media_org ON public.media_assets(organization_id);

-- 8. PROCESSING JOBS
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_org_status ON public.processing_jobs(organization_id, status);
CREATE INDEX idx_jobs_idempotency ON public.processing_jobs(idempotency_key);

CREATE TRIGGER trg_processing_jobs_updated_at
BEFORE UPDATE ON public.processing_jobs
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 9. TRANSCRIPT SEGMENTS
CREATE TABLE IF NOT EXISTS public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  start_time NUMERIC(10, 3) NOT NULL CHECK (start_time >= 0),
  end_time NUMERIC(10, 3) NOT NULL CHECK (end_time >= start_time),
  text TEXT NOT NULL,
  words JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0 AND confidence <= 1.000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcript_meeting_start ON public.transcript_segments(meeting_id, start_time);
CREATE INDEX idx_transcript_org ON public.transcript_segments(organization_id);

-- 10. MEETING SUMMARIES
CREATE TABLE IF NOT EXISTS public.meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  executive_summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  topics_discussed JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meeting_summary_version UNIQUE (meeting_id, version)
);

CREATE INDEX idx_summaries_meeting ON public.meeting_summaries(meeting_id);
CREATE INDEX idx_summaries_org ON public.meeting_summaries(organization_id);

CREATE TRIGGER trg_meeting_summaries_updated_at
BEFORE UPDATE ON public.meeting_summaries
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 11. MEETING MINUTES
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft_ai' CHECK (
    review_status IN ('draft_ai', 'pending_review', 'validated_human', 'rejected_human', 'final_signed')
  ),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meeting_minutes_version UNIQUE (meeting_id, version)
);

CREATE INDEX idx_minutes_meeting ON public.meeting_minutes(meeting_id);
CREATE INDEX idx_minutes_org ON public.meeting_minutes(organization_id);

CREATE TRIGGER trg_meeting_minutes_updated_at
BEFORE UPDATE ON public.meeting_minutes
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 12. MEETING DECISIONS
CREATE TABLE IF NOT EXISTS public.meeting_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES public.transcript_segments(id) ON DELETE SET NULL,
  start_time NUMERIC(10, 3),
  end_time NUMERIC(10, 3),
  quote TEXT,
  decision_text TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'pending_validation' CHECK (
    classification IN ('approved_decision', 'proposal', 'rejected', 'pending_validation')
  ),
  confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (confidence_score >= 0 AND confidence_score <= 1.000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_approved_decision_quote CHECK (
    classification <> 'approved_decision' OR quote IS NOT NULL
  )
);

CREATE INDEX idx_decisions_meeting ON public.meeting_decisions(meeting_id);
CREATE INDEX idx_decisions_org ON public.meeting_decisions(organization_id);

CREATE TRIGGER trg_meeting_decisions_updated_at
BEFORE UPDATE ON public.meeting_decisions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 13. MEETING TASKS
CREATE TABLE IF NOT EXISTS public.meeting_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES public.transcript_segments(id) ON DELETE SET NULL,
  start_time NUMERIC(10, 3),
  end_time NUMERIC(10, 3),
  quote TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assignee_name TEXT,
  assignee_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_meeting ON public.meeting_tasks(meeting_id);
CREATE INDEX idx_tasks_org_status ON public.meeting_tasks(organization_id, status);

CREATE TRIGGER trg_meeting_tasks_updated_at
BEFORE UPDATE ON public.meeting_tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 14. MEETING DOCUMENTS
CREATE TABLE IF NOT EXISTS public.meeting_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('pdf', 'docx', 'txt')),
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_meeting ON public.meeting_documents(meeting_id);
CREATE INDEX idx_documents_org ON public.meeting_documents(organization_id);

-- 15. PLANS
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE CHECK (code IN ('free', 'pro', 'business', 'enterprise')),
  monthly_minutes_included INTEGER NOT NULL CHECK (monthly_minutes_included >= 0),
  seats_included INTEGER NOT NULL CHECK (seats_included >= 1),
  price_cents_usd INTEGER NOT NULL CHECK (price_cents_usd >= 0),
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial plans
INSERT INTO public.plans (name, code, monthly_minutes_included, seats_included, price_cents_usd, features)
VALUES
  ('Free Plan', 'free', 45, 1, 0, '{"stt": "basic", "minutes": true, "export": ["txt"]}'::jsonb),
  ('Pro Plan', 'pro', 600, 1, 1900, '{"stt": "deepgram", "minutes": true, "chat": true, "export": ["txt", "pdf", "docx"]}'::jsonb),
  ('Business Plan', 'business', 2500, 5, 7900, '{"stt": "deepgram", "diarization": true, "minutes": true, "chat": true, "team_sharing": true, "export": ["txt", "pdf", "docx"]}'::jsonb),
  ('Enterprise Plan', 'enterprise', 10000, 50, 29900, '{"stt": "premium", "custom_retention": true, "sla": true, "export": ["txt", "pdf", "docx"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 16. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')
  ),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org ON public.subscriptions(organization_id);

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 17. USAGE LEDGER (Strict Idempotency & Financial Audit)
CREATE TABLE IF NOT EXISTS public.usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK (
    operation IN ('transcription_minutes', 'llm_extraction', 'llm_chat', 'storage_gb', 'manual_credit')
  ),
  quantity NUMERIC(10, 2) NOT NULL,
  unit TEXT NOT NULL,
  cost_cents_usd INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (
    status IN ('reserved', 'settled', 'cancelled', 'refunded')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_org_status ON public.usage_ledger(organization_id, status);
CREATE INDEX idx_ledger_idempotency ON public.usage_ledger(idempotency_key);

CREATE TRIGGER trg_usage_ledger_updated_at
BEFORE UPDATE ON public.usage_ledger
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 18. PAYMENT EVENTS
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payment_provider_event UNIQUE (provider, external_event_id)
);

CREATE INDEX idx_payments_org ON public.payment_events(organization_id);

-- 19. AI PROVIDER REQUESTS
CREATE TABLE IF NOT EXISTS public.ai_provider_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('deepgram', 'gladia', 'gemini', 'claude', 'openai')),
  endpoint TEXT NOT NULL,
  request_id TEXT,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  tokens_in INTEGER,
  tokens_out INTEGER,
  audio_duration_seconds INTEGER,
  cost_usd NUMERIC(8, 6) NOT NULL DEFAULT 0.000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_requests_org ON public.ai_provider_requests(organization_id);
CREATE INDEX idx_ai_requests_meeting ON public.ai_provider_requests(meeting_id);

-- 20. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
