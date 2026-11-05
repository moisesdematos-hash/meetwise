-- ==============================================================================
-- MEETWISE AI — UNIFIED STAGING SCHEMA & MIGRATIONS
-- Target Environment: Supabase Cloud Staging (Project: ycxwomqqepetickmxxqj)
-- Description: Consolidated 7 sequential migrations (Phases 1-6)
-- Security: Fully idempotent, non-destructive, with RLS and Anti-Tamper Triggers
-- ==============================================================================

-- 1. SETUP MIGRATION TRACKING SCHEMA & TABLE
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);


-- ==============================================================================
-- STEP 1/7: MIGRATION 20261104000001 (initial_schema)
-- Source: supabase/migrations/20261104000001_initial_schema.sql
-- ==============================================================================

-- ==============================================================================
-- MEETWISE AI — Initial Relational Schema
-- Migration: 20261104000001_initial_schema.sql
-- Description: Creates 20 foundational tables with foreign keys, constraints,
--              audit timestamps, and optimized indexes.
-- ==============================================================================

-- Enable extensions if available (gen_random_uuid is native in Postgres 13+)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

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

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
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

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
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

DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.organization_members;
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

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
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

DROP TRIGGER IF EXISTS trg_processing_jobs_updated_at ON public.processing_jobs;
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

DROP TRIGGER IF EXISTS trg_meeting_summaries_updated_at ON public.meeting_summaries;
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

DROP TRIGGER IF EXISTS trg_meeting_minutes_updated_at ON public.meeting_minutes;
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

DROP TRIGGER IF EXISTS trg_meeting_decisions_updated_at ON public.meeting_decisions;
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

DROP TRIGGER IF EXISTS trg_meeting_tasks_updated_at ON public.meeting_tasks;
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

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
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

DROP TRIGGER IF EXISTS trg_usage_ledger_updated_at ON public.usage_ledger;
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


-- Record migration 20261104000001 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000001', 'initial_schema')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
-- STEP 2/7: MIGRATION 20261104000002 (rls_policies)
-- Source: supabase/migrations/20261104000002_rls_policies.sql
-- ==============================================================================

-- ==============================================================================
-- MEETWISE AI — Multi-Tenant Row Level Security & RBAC Protection
-- Migration: 20261104000002_rls_policies.sql
-- Description: Enables strict Row Level Security on all tenant tables,
--              defines SECURITY DEFINER helper functions with search_path protection,
--              and attaches triggers to prevent tenant tampering and last-owner deletion.
-- ==============================================================================

-- 0. ENSURE STANDARD SUPABASE ROLES EXIST (Safe idempotency for any Postgres environment)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Grant schema usage to standard roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.plans TO anon;

-- 1. SECURITY DEFINER HELPER FUNCTION
-- Returns the organization IDs and roles for the currently authenticated user
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS TABLE (org_id UUID, role TEXT) 
LANGUAGE sql STABLE SECURITY DEFINER 
SET search_path = public, auth, pg_temp AS $$
  SELECT organization_id, role 
  FROM public.organization_members 
  WHERE user_id = auth.uid() AND status = 'active';
$$;

-- Restrict execute privilege to authenticated users and service_role
REVOKE ALL ON FUNCTION public.current_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO authenticated, service_role;

-- 1.1 HELPER: CHECK IF ORGANIZATION HAS NO MEMBERS (Avoids RLS circular recursion)
CREATE OR REPLACE FUNCTION public.is_org_without_members(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = p_org_id);
$$;

REVOKE ALL ON FUNCTION public.is_org_without_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_without_members(UUID) TO authenticated, service_role;

-- 2. TRIGGER: PREVENT MODIFICATION OF organization_id (Tenant Tampering)
CREATE OR REPLACE FUNCTION public.prevent_org_id_tamper()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'Security Violation: Tampering with organization_id is strictly prohibited.';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. TRIGGER: PREVENT REMOVING OR DEMOTING THE LAST ACTIVE OWNER
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SET search_path = public, pg_temp AS $$
DECLARE
  active_owners_count INTEGER;
BEGIN
  -- If an owner is being deleted or their role/status changed
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    
    SELECT COUNT(*) INTO active_owners_count
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;

    IF active_owners_count < 1 THEN
      RAISE EXCEPTION 'Security Violation: Cannot remove or demote the last remaining active owner of an organization.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.organization_members;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- 4. ATOMIC ONBOARDING RPC
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_language TEXT DEFAULT 'pt',
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required to create organization';
  END IF;

  IF trim(p_name) IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Organization name must be at least 2 characters';
  END IF;

  IF trim(p_slug) IS NULL OR length(trim(p_slug)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Organization slug must be at least 2 characters';
  END IF;

  -- 1. Ensure profile exists / updated
  IF p_full_name IS NOT NULL AND trim(p_full_name) <> '' THEN
    UPDATE public.profiles
    SET full_name = trim(p_full_name),
        locale = COALESCE(p_language, 'pt'),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- 2. Insert organization
  INSERT INTO public.organizations (name, slug, created_by, default_language)
  VALUES (trim(p_name), trim(p_slug), v_user_id, COALESCE(p_language, 'pt'))
  RETURNING id INTO v_org_id;

  -- 3. Insert owner membership atomically
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, v_user_id, 'owner', 'active');

  SELECT jsonb_build_object(
    'id', v_org_id,
    'name', trim(p_name),
    'slug', trim(p_slug),
    'default_language', COALESCE(p_language, 'pt'),
    'role', 'owner'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Attach tenant-tampering triggers to all child tables
DROP TRIGGER IF EXISTS trg_tamper_meetings ON public.meetings;
CREATE TRIGGER trg_tamper_meetings BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_participants ON public.meeting_participants;
CREATE TRIGGER trg_tamper_participants BEFORE UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_media ON public.media_assets;
CREATE TRIGGER trg_tamper_media BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_jobs ON public.processing_jobs;
CREATE TRIGGER trg_tamper_jobs BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_segments ON public.transcript_segments;
CREATE TRIGGER trg_tamper_segments BEFORE UPDATE ON public.transcript_segments FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_summaries ON public.meeting_summaries;
CREATE TRIGGER trg_tamper_summaries BEFORE UPDATE ON public.meeting_summaries FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_minutes ON public.meeting_minutes;
CREATE TRIGGER trg_tamper_minutes BEFORE UPDATE ON public.meeting_minutes FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_decisions ON public.meeting_decisions;
CREATE TRIGGER trg_tamper_decisions BEFORE UPDATE ON public.meeting_decisions FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_tasks ON public.meeting_tasks;
CREATE TRIGGER trg_tamper_tasks BEFORE UPDATE ON public.meeting_tasks FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_documents ON public.meeting_documents;
CREATE TRIGGER trg_tamper_documents BEFORE UPDATE ON public.meeting_documents FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
DROP TRIGGER IF EXISTS trg_tamper_ledger ON public.usage_ledger;
CREATE TRIGGER trg_tamper_ledger BEFORE UPDATE ON public.usage_ledger FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

-- ==============================================================================
-- ENABLE RLS ON ALL TABLES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- 1. PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. ORGANIZATIONS
DROP POLICY IF EXISTS "org_select_member" ON public.organizations;
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT org_id FROM public.current_user_org_ids())
    OR
    (created_by = auth.uid() AND public.is_org_without_members(id))
  );

DROP POLICY IF EXISTS "org_insert_auth" ON public.organizations;
CREATE POLICY "org_insert_auth" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "org_update_admin" ON public.organizations;
CREATE POLICY "org_update_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "org_delete_owner" ON public.organizations;
CREATE POLICY "org_delete_owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role = 'owner'));

-- 3. ORGANIZATION MEMBERS
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    organization_id IN (SELECT org_id FROM public.current_user_org_ids())
  );

DROP POLICY IF EXISTS "org_members_insert_admin" ON public.organization_members;
CREATE POLICY "org_members_insert_admin" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin'))
    OR
    -- Allow the organization creator to add themselves as first owner (using SECURITY DEFINER to prevent recursion)
    (user_id = auth.uid() AND role = 'owner' AND public.is_org_without_members(organization_id))
  );

DROP POLICY IF EXISTS "org_members_update_admin" ON public.organization_members;
CREATE POLICY "org_members_update_admin" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "org_members_delete_admin" ON public.organization_members;
CREATE POLICY "org_members_delete_admin" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin'))
    OR user_id = auth.uid() -- Member can voluntarily leave the organization
  );

-- 4. ORGANIZATION INVITATIONS
DROP POLICY IF EXISTS "invitations_select" ON public.organization_invitations;
CREATE POLICY "invitations_select" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "invitations_manage_admin" ON public.organization_invitations;
CREATE POLICY "invitations_manage_admin" ON public.organization_invitations
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 5. MEETINGS
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 6. MEETING PARTICIPANTS
DROP POLICY IF EXISTS "participants_select" ON public.meeting_participants;
CREATE POLICY "participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "participants_write" ON public.meeting_participants;
CREATE POLICY "participants_write" ON public.meeting_participants
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 7. MEDIA ASSETS
DROP POLICY IF EXISTS "media_select" ON public.media_assets;
CREATE POLICY "media_select" ON public.media_assets
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "media_insert" ON public.media_assets;
CREATE POLICY "media_insert" ON public.media_assets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

DROP POLICY IF EXISTS "media_delete" ON public.media_assets;
CREATE POLICY "media_delete" ON public.media_assets
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 8. PROCESSING JOBS (Managed primarily by background worker via service_role)
DROP POLICY IF EXISTS "jobs_select" ON public.processing_jobs;
CREATE POLICY "jobs_select" ON public.processing_jobs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- 9. TRANSCRIPT SEGMENTS
DROP POLICY IF EXISTS "segments_select" ON public.transcript_segments;
CREATE POLICY "segments_select" ON public.transcript_segments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "segments_write" ON public.transcript_segments;
CREATE POLICY "segments_write" ON public.transcript_segments
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 10. MEETING SUMMARIES
DROP POLICY IF EXISTS "summaries_select" ON public.meeting_summaries;
CREATE POLICY "summaries_select" ON public.meeting_summaries
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "summaries_write" ON public.meeting_summaries;
CREATE POLICY "summaries_write" ON public.meeting_summaries
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 11. MEETING MINUTES
DROP POLICY IF EXISTS "minutes_select" ON public.meeting_minutes;
CREATE POLICY "minutes_select" ON public.meeting_minutes
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "minutes_write" ON public.meeting_minutes;
CREATE POLICY "minutes_write" ON public.meeting_minutes
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 12. MEETING DECISIONS
DROP POLICY IF EXISTS "decisions_select" ON public.meeting_decisions;
CREATE POLICY "decisions_select" ON public.meeting_decisions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "decisions_write" ON public.meeting_decisions;
CREATE POLICY "decisions_write" ON public.meeting_decisions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 13. MEETING TASKS
DROP POLICY IF EXISTS "tasks_select" ON public.meeting_tasks;
CREATE POLICY "tasks_select" ON public.meeting_tasks
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "tasks_write" ON public.meeting_tasks;
CREATE POLICY "tasks_write" ON public.meeting_tasks
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 14. MEETING DOCUMENTS
DROP POLICY IF EXISTS "documents_select" ON public.meeting_documents;
CREATE POLICY "documents_select" ON public.meeting_documents
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "documents_write" ON public.meeting_documents;
CREATE POLICY "documents_write" ON public.meeting_documents
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 15. PLANS (Public read for authenticated users)
DROP POLICY IF EXISTS "plans_select_all" ON public.plans;
CREATE POLICY "plans_select_all" ON public.plans
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- 16. SUBSCRIPTIONS
DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "subscriptions_manage_owner" ON public.subscriptions;
CREATE POLICY "subscriptions_manage_owner" ON public.subscriptions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 17. USAGE LEDGER (Auditable by org members, mutable only via service role / backend)
DROP POLICY IF EXISTS "usage_ledger_select" ON public.usage_ledger;
CREATE POLICY "usage_ledger_select" ON public.usage_ledger
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- 18. PAYMENT EVENTS
DROP POLICY IF EXISTS "payments_select_admin" ON public.payment_events;
CREATE POLICY "payments_select_admin" ON public.payment_events
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 19. AI PROVIDER REQUESTS
DROP POLICY IF EXISTS "ai_requests_select_admin" ON public.ai_provider_requests;
CREATE POLICY "ai_requests_select_admin" ON public.ai_provider_requests
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 20. AUDIT LOGS (Strict Append-Only for Audit Integrity)
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));


-- Record migration 20261104000002 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000002', 'rls_policies')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
-- STEP 3/7: MIGRATION 20261104000003 (storage_and_indexes)
-- Source: supabase/migrations/20261104000003_storage_and_indexes.sql
-- ==============================================================================

-- ==============================================================================
-- MEETWISE AI — Storage Configuration and Policies
-- Migration: 20261104000003_storage_and_indexes.sql
-- Description: Sets up private storage buckets with strict MIME type and size limits,
--              and configures multi-tenant RLS policies for storage.objects.
-- ==============================================================================

-- 1. REGISTER PRIVATE STORAGE BUCKETS (If storage schema is present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES 
      (
        'meeting_recordings', 
        'meeting_recordings', 
        false, 
        524288000, -- 500 MB
        ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'video/mp4']
      ),
      (
        'meeting_documents', 
        'meeting_documents', 
        false, 
        52428800, -- 50 MB
        ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
      )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

  END IF;

  -- 2. STORAGE RLS POLICIES (Enforce path isolation: {org_id}/{meeting_id}/{filename})
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    BEGIN
      -- Grant schema and table access to standard roles
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT SELECT ON storage.buckets TO anon, authenticated;

      -- Safely enable RLS in standalone/test postgres environments (in Supabase Cloud, RLS is enabled by default by storage admin)
      BEGIN
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;

      -- Drop existing policies if any to prevent conflicts
      DROP POLICY IF EXISTS "storage_select_org_member" ON storage.objects;
      DROP POLICY IF EXISTS "storage_insert_org_member" ON storage.objects;
      DROP POLICY IF EXISTS "storage_delete_org_admin" ON storage.objects;

      -- SELECT: Member can read files whose path starts with their active organization ID
      DROP POLICY IF EXISTS "storage_select_org_member" ON storage.objects;
CREATE POLICY "storage_select_org_member" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id IN ('meeting_recordings', 'meeting_documents') AND
          (storage.foldername(name))[1]::UUID IN (SELECT org_id FROM public.current_user_org_ids())
        );

      -- INSERT: Member with upload permissions can upload to their active organization folder
      DROP POLICY IF EXISTS "storage_insert_org_member" ON storage.objects;
CREATE POLICY "storage_insert_org_member" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id IN ('meeting_recordings', 'meeting_documents') AND
          (storage.foldername(name))[1]::UUID IN (
            SELECT org_id FROM public.current_user_org_ids() 
            WHERE role IN ('owner', 'admin', 'manager', 'member')
          )
        );

      -- DELETE: Only owners or admins can delete media assets
      DROP POLICY IF EXISTS "storage_delete_org_admin" ON storage.objects;
CREATE POLICY "storage_delete_org_admin" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id IN ('meeting_recordings', 'meeting_documents') AND
          (storage.foldername(name))[1]::UUID IN (
            SELECT org_id FROM public.current_user_org_ids() 
            WHERE role IN ('owner', 'admin')
          )
        );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Storage RLS notice: %', SQLERRM;
    END;
  END IF;
END $$;


-- Record migration 20261104000003 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000003', 'storage_and_indexes')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
