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
-- STEP 4/7: MIGRATION 20261104000004 (phase_3_transcription)
-- Source: supabase/migrations/20261104000004_phase_3_transcription.sql
-- ==============================================================================

-- ============================================================================
-- MEETWISE AI — PHASE 3 DATABASE MIGRATION
-- Transcrição Inteligente, Diarização, Edição e Revisão Humana
-- ============================================================================

-- 1. Enhancements to transcript_segments: tracking edits and audit
ALTER TABLE public.transcript_segments
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Trigger for transcript_segments updated_at
DROP TRIGGER IF EXISTS trg_transcript_segments_updated_at ON public.transcript_segments;
CREATE TRIGGER trg_transcript_segments_updated_at
  BEFORE UPDATE ON public.transcript_segments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Enhancements to meetings: human review status and audit
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS transcription_review_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (transcription_review_status IN ('draft', 'in_review', 'validated')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 3. Atomic Speaker Renaming Function
-- Renames a speaker label across all segments of a meeting and synchronizes meeting_participants
CREATE OR REPLACE FUNCTION public.rename_meeting_speaker(
  p_meeting_id UUID,
  p_old_speaker_label TEXT,
  p_new_speaker_label TEXT,
  p_participant_name TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_org_id UUID;
BEGIN
  -- Verify meeting exists and caller has access via RLS
  SELECT organization_id INTO v_org_id
  FROM public.meetings
  WHERE id = p_meeting_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Meeting % not found or access denied', p_meeting_id;
  END IF;

  -- 1. Update all transcript segments with old speaker label
  UPDATE public.transcript_segments
  SET speaker_label = p_new_speaker_label,
      updated_at = NOW()
  WHERE meeting_id = p_meeting_id
    AND speaker_label = p_old_speaker_label;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- 2. Update existing meeting participant or insert if not present
  UPDATE public.meeting_participants
  SET speaker_label = p_new_speaker_label,
      name = COALESCE(p_participant_name, name)
  WHERE meeting_id = p_meeting_id
    AND speaker_label = p_old_speaker_label;

  IF NOT FOUND THEN
    INSERT INTO public.meeting_participants (
      meeting_id,
      organization_id,
      name,
      speaker_label
    ) VALUES (
      p_meeting_id,
      v_org_id,
      COALESCE(p_participant_name, p_new_speaker_label),
      p_new_speaker_label
    );
  END IF;

  RETURN v_updated_count;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.rename_meeting_speaker(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Additional Performance and Security Indexes
CREATE INDEX IF NOT EXISTS idx_transcript_speaker
  ON public.transcript_segments(meeting_id, speaker_label);

CREATE INDEX IF NOT EXISTS idx_jobs_meeting_operation
  ON public.processing_jobs(meeting_id, operation);

CREATE INDEX IF NOT EXISTS idx_media_meeting_created
  ON public.media_assets(meeting_id, created_at DESC);


-- Record migration 20261104000004 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000004', 'phase_3_transcription')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
-- STEP 5/7: MIGRATION 20261104000005 (phase_4_intelligence)
-- Source: supabase/migrations/20261104000005_phase_4_intelligence.sql
-- ==============================================================================

-- ============================================================================
-- MEETWISE AI — PHASE 4 DATABASE MIGRATION
-- Inteligência de Reuniões, Atas, Decisões, Tarefas e Templates Customizados
-- ============================================================================

-- 1. Organization Templates Table
CREATE TABLE IF NOT EXISTS public.organization_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'formal' CHECK (
    template_type IN ('formal', 'executive', 'simplified', 'custom')
  ),
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  terminology JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT NOT NULL DEFAULT 'pt',
  formatting_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON public.organization_templates(organization_id);

DROP TRIGGER IF EXISTS trg_templates_updated_at ON public.organization_templates;
CREATE TRIGGER trg_templates_updated_at
BEFORE UPDATE ON public.organization_templates
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Attach tamper prevention trigger to organization_templates
DROP TRIGGER IF EXISTS trg_tamper_templates ON public.organization_templates;
CREATE TRIGGER trg_tamper_templates
BEFORE UPDATE ON public.organization_templates
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

-- Grant permissions to standard roles
GRANT ALL ON TABLE public.organization_templates TO authenticated, service_role;

-- Enable RLS on organization_templates
ALTER TABLE public.organization_templates ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "templates_select" ON public.organization_templates;
CREATE POLICY "templates_select" ON public.organization_templates
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "templates_write" ON public.organization_templates;
CREATE POLICY "templates_write" ON public.organization_templates
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

-- 2. Enhancements to meeting_summaries
ALTER TABLE public.meeting_summaries
  ADD COLUMN IF NOT EXISTS brief_summary TEXT,
  ADD COLUMN IF NOT EXISTS detailed_summary TEXT,
  ADD COLUMN IF NOT EXISTS next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_by_model TEXT,
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;

-- 3. Enhancements to meeting_minutes
ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'formal',
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.organization_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 4. Enhancements to meeting_decisions (Expand classification check constraint)
ALTER TABLE public.meeting_decisions
  DROP CONSTRAINT IF EXISTS meeting_decisions_classification_check;

ALTER TABLE public.meeting_decisions
  ADD CONSTRAINT meeting_decisions_classification_check CHECK (
    classification IN (
      'approved_decision',
      'proposed_decision',
      'discussed_decision',
      'rejected_decision',
      'deferred_decision',
      'pending_validation',
      'proposal',
      'rejected'
    )
  );

ALTER TABLE public.meeting_decisions
  ADD COLUMN IF NOT EXISTS rationale TEXT,
  ADD COLUMN IF NOT EXISTS responsible_name TEXT,
  ADD COLUMN IF NOT EXISTS status_evidence TEXT,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 5. Enhancements to meeting_tasks
ALTER TABLE public.meeting_tasks
  ADD COLUMN IF NOT EXISTS task_nature TEXT NOT NULL DEFAULT 'assigned'
  CHECK (task_nature IN ('assigned', 'suggested', 'pending_confirmation')),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 6. Update ai_provider_requests check constraint to allow 'mock'
ALTER TABLE public.ai_provider_requests
  DROP CONSTRAINT IF EXISTS ai_provider_requests_provider_check;

ALTER TABLE public.ai_provider_requests
  ADD CONSTRAINT ai_provider_requests_provider_check CHECK (
    provider IN ('deepgram', 'gladia', 'gemini', 'claude', 'openai', 'mock')
  );

-- Additional Indexes for Phase 4 Performance
CREATE INDEX IF NOT EXISTS idx_decisions_meeting_class ON public.meeting_decisions(meeting_id, classification);
CREATE INDEX IF NOT EXISTS idx_tasks_meeting_nature ON public.meeting_tasks(meeting_id, task_nature);
CREATE INDEX IF NOT EXISTS idx_minutes_meeting_version ON public.meeting_minutes(meeting_id, version DESC);

-- Ensure all enhanced tables maintain full permissions for authenticated role and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;



-- Record migration 20261104000005 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000005', 'phase_4_intelligence')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
-- STEP 6/7: MIGRATION 20261104000006 (phase_5_export_and_collaboration)
-- Source: supabase/migrations/20261104000006_phase_5_export_and_collaboration.sql
-- ==============================================================================

-- ============================================================================
-- MEETWISE AI — PHASE 5 DATABASE MIGRATION
-- Exportação Profissional, Colaboração, Versionamento e Partilha Segura
-- ============================================================================

-- 1. Organization Document Sequences (Concurrency-safe sequential numbering)
CREATE TABLE IF NOT EXISTS public.organization_document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'ATA',
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  last_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_seq_prefix_year UNIQUE (organization_id, prefix, year)
);

CREATE INDEX IF NOT EXISTS idx_doc_seq_org ON public.organization_document_sequences(organization_id);

DROP TRIGGER IF EXISTS trg_doc_seq_updated_at ON public.organization_document_sequences;
CREATE TRIGGER trg_doc_seq_updated_at
BEFORE UPDATE ON public.organization_document_sequences
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_seq ON public.organization_document_sequences;
CREATE TRIGGER trg_tamper_doc_seq
BEFORE UPDATE ON public.organization_document_sequences
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.organization_document_sequences TO authenticated, service_role;
ALTER TABLE public.organization_document_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_seq_select" ON public.organization_document_sequences;
CREATE POLICY "doc_seq_select" ON public.organization_document_sequences
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "doc_seq_write" ON public.organization_document_sequences;
CREATE POLICY "doc_seq_write" ON public.organization_document_sequences
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

-- Function to get the next sequential document number atomically
CREATE OR REPLACE FUNCTION public.get_next_document_number(
  p_org_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_prefix TEXT DEFAULT 'ATA'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_num INTEGER;
  v_doc_number TEXT;
BEGIN
  -- Insert or increment sequence atomically
  INSERT INTO public.organization_document_sequences (organization_id, prefix, year, last_number)
  VALUES (p_org_id, p_prefix, p_year, 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET 
    last_number = public.organization_document_sequences.last_number + 1,
    updated_at = NOW()
  RETURNING last_number INTO v_next_num;

  -- Format e.g. 'ATA-2026-001'
  v_doc_number := p_prefix || '-' || p_year::TEXT || '-' || LPAD(v_next_num::TEXT, 3, '0');
  RETURN v_doc_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_document_number(UUID, INTEGER, TEXT) TO authenticated, service_role;

-- 2. Enhancements to meeting_minutes
ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_status TEXT DEFAULT 'not_exported'
    CHECK (export_status IN ('not_exported', 'exported', 'pending')),
  ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_minutes_doc_number ON public.meeting_minutes(organization_id, document_number);

-- 3. Enhancements to meeting_documents (Export records)
ALTER TABLE public.meeting_documents
  ADD COLUMN IF NOT EXISTS minutes_id UUID REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'formal',
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.organization_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Document Versions History Table (Immutable historical snapshots)
CREATE TABLE IF NOT EXISTS public.meeting_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  minutes_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL,
  document_number TEXT,
  change_reason TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_minutes_version_history UNIQUE (minutes_id, version)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_minutes ON public.meeting_document_versions(minutes_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_doc_versions_org ON public.meeting_document_versions(organization_id);

DROP TRIGGER IF EXISTS trg_tamper_doc_versions ON public.meeting_document_versions;
CREATE TRIGGER trg_tamper_doc_versions
BEFORE UPDATE ON public.meeting_document_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.meeting_document_versions TO authenticated, service_role;
ALTER TABLE public.meeting_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_versions_select" ON public.meeting_document_versions;
CREATE POLICY "doc_versions_select" ON public.meeting_document_versions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "doc_versions_insert" ON public.meeting_document_versions;
CREATE POLICY "doc_versions_insert" ON public.meeting_document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor'))
  );

-- 5. Document Comments Table (Controlled collaboration)
CREATE TABLE IF NOT EXISTS public.meeting_document_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  minutes_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_minutes ON public.meeting_document_comments(minutes_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_doc_comments_org ON public.meeting_document_comments(organization_id);

DROP TRIGGER IF EXISTS trg_doc_comments_updated_at ON public.meeting_document_comments;
CREATE TRIGGER trg_doc_comments_updated_at
BEFORE UPDATE ON public.meeting_document_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_comments ON public.meeting_document_comments;
CREATE TRIGGER trg_tamper_doc_comments
BEFORE UPDATE ON public.meeting_document_comments
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.meeting_document_comments TO authenticated, service_role;
ALTER TABLE public.meeting_document_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_comments_select" ON public.meeting_document_comments;
CREATE POLICY "doc_comments_select" ON public.meeting_document_comments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "doc_comments_insert" ON public.meeting_document_comments;
CREATE POLICY "doc_comments_insert" ON public.meeting_document_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor', 'viewer'))
  );

DROP POLICY IF EXISTS "doc_comments_update" ON public.meeting_document_comments;
CREATE POLICY "doc_comments_update" ON public.meeting_document_comments
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

DROP POLICY IF EXISTS "doc_comments_delete" ON public.meeting_document_comments;
CREATE POLICY "doc_comments_delete" ON public.meeting_document_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin'))
  );

-- 6. Document Shares Table (Cryptographic secure sharing)
CREATE TABLE IF NOT EXISTS public.meeting_document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  minutes_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  token_hash TEXT NOT NULL UNIQUE,
  recipient_email TEXT,
  share_type TEXT NOT NULL DEFAULT 'internal' CHECK (share_type IN ('internal', 'external_link')),
  permissions TEXT NOT NULL DEFAULT 'view' CHECK (permissions IN ('view', 'comment')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_count INTEGER NOT NULL DEFAULT 0,
  max_accesses INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_shares_org ON public.meeting_document_shares(organization_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_minutes ON public.meeting_document_shares(minutes_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_token_hash ON public.meeting_document_shares(token_hash);

DROP TRIGGER IF EXISTS trg_doc_shares_updated_at ON public.meeting_document_shares;
CREATE TRIGGER trg_doc_shares_updated_at
BEFORE UPDATE ON public.meeting_document_shares
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_shares ON public.meeting_document_shares;
CREATE TRIGGER trg_tamper_doc_shares
BEFORE UPDATE ON public.meeting_document_shares
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.meeting_document_shares TO authenticated, service_role;
ALTER TABLE public.meeting_document_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_shares_select" ON public.meeting_document_shares;
CREATE POLICY "doc_shares_select" ON public.meeting_document_shares
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "doc_shares_insert" ON public.meeting_document_shares;
CREATE POLICY "doc_shares_insert" ON public.meeting_document_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor'))
  );

DROP POLICY IF EXISTS "doc_shares_update" ON public.meeting_document_shares;
CREATE POLICY "doc_shares_update" ON public.meeting_document_shares
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

DROP POLICY IF EXISTS "doc_shares_delete" ON public.meeting_document_shares;
CREATE POLICY "doc_shares_delete" ON public.meeting_document_shares
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));


-- Record migration 20261104000006 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261104000006', 'phase_5_export_and_collaboration')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;


-- ==============================================================================
-- STEP 7/7: MIGRATION 20261105000007 (phase_6_monetization_and_admin)
-- Source: supabase/migrations/20261105000007_phase_6_monetization_and_admin.sql
-- ==============================================================================

-- ==============================================================================
-- MEETWISE AI — FASE 6: MONETIZAÇÃO, SUBSCRIÇÕES, PAGAMENTOS E ADMINISTRAÇÃO
-- Migration: 20261105000007_phase_6_monetization_and_admin.sql
-- ==============================================================================

-- 1. EXPANDIR PLANOS COMERCIAIS (Adicionar 'starter')
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_code_check 
  CHECK (code IN ('free', 'starter', 'pro', 'business', 'enterprise'));

-- Inserir Plano Starter caso não exista
INSERT INTO public.plans (name, code, monthly_minutes_included, seats_included, price_cents_usd, features)
VALUES
  ('Starter Plan', 'starter', 180, 1, 900, '{"stt": "deepgram", "minutes": true, "export": ["txt", "pdf"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 2. TABELA DE PREÇOS VERSIONADOS MULTI-MOEDA (plan_prices)
CREATE TABLE IF NOT EXISTS public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  external_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_plan_price_currency_interval_ver UNIQUE (plan_id, currency, billing_interval, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON public.plan_prices(plan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_plan_prices_currency ON public.plan_prices(currency, is_active);

-- Seed de preços de demonstração para todos os planos e moedas
DO $$
DECLARE
  v_free_id UUID;
  v_starter_id UUID;
  v_pro_id UUID;
  v_biz_id UUID;
  v_ent_id UUID;
BEGIN
  SELECT id INTO v_free_id FROM public.plans WHERE code = 'free';
  SELECT id INTO v_starter_id FROM public.plans WHERE code = 'starter';
  SELECT id INTO v_pro_id FROM public.plans WHERE code = 'pro';
  SELECT id INTO v_biz_id FROM public.plans WHERE code = 'business';
  SELECT id INTO v_ent_id FROM public.plans WHERE code = 'enterprise';

  -- Preços Gratuitos (0 em todas as moedas)
  IF v_free_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_free_id, 'USD', 0, 'monthly'), (v_free_id, 'EUR', 0, 'monthly'),
      (v_free_id, 'AOA', 0, 'monthly'), (v_free_id, 'BRL', 0, 'monthly')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Starter ($9 USD / €8.50 EUR / 8,000 AOA / R$ 49 BRL)
  IF v_starter_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_starter_id, 'USD', 900, 'monthly'), (v_starter_id, 'EUR', 850, 'monthly'),
      (v_starter_id, 'AOA', 800000, 'monthly'), (v_starter_id, 'BRL', 4900, 'monthly'),
      (v_starter_id, 'USD', 9000, 'annual'), (v_starter_id, 'EUR', 8500, 'annual'),
      (v_starter_id, 'AOA', 8000000, 'annual'), (v_starter_id, 'BRL', 49000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Pro ($19 USD / €18 EUR / 16,500 AOA / R$ 99 BRL)
  IF v_pro_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_pro_id, 'USD', 1900, 'monthly'), (v_pro_id, 'EUR', 1800, 'monthly'),
      (v_pro_id, 'AOA', 1650000, 'monthly'), (v_pro_id, 'BRL', 9900, 'monthly'),
      (v_pro_id, 'USD', 19000, 'annual'), (v_pro_id, 'EUR', 18000, 'annual'),
      (v_pro_id, 'AOA', 16500000, 'annual'), (v_pro_id, 'BRL', 99000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Business ($79 USD / €75 EUR / 68,000 AOA / R$ 399 BRL)
  IF v_biz_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_biz_id, 'USD', 7900, 'monthly'), (v_biz_id, 'EUR', 7500, 'monthly'),
      (v_biz_id, 'AOA', 6800000, 'monthly'), (v_biz_id, 'BRL', 39900, 'monthly'),
      (v_biz_id, 'USD', 79000, 'annual'), (v_biz_id, 'EUR', 75000, 'annual'),
      (v_biz_id, 'AOA', 68000000, 'annual'), (v_biz_id, 'BRL', 399000, 'annual')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;

  -- Preços Enterprise ($299 USD / €280 EUR / 260,000 AOA / R$ 1,499 BRL)
  IF v_ent_id IS NOT NULL THEN
    INSERT INTO public.plan_prices (plan_id, currency, amount_cents, billing_interval)
    VALUES
      (v_ent_id, 'USD', 29900, 'monthly'), (v_ent_id, 'EUR', 28000, 'monthly'),
      (v_ent_id, 'AOA', 26000000, 'monthly'), (v_ent_id, 'BRL', 149900, 'monthly')
    ON CONFLICT (plan_id, currency, billing_interval, version) DO NOTHING;
  END IF;
END $$;

-- 3. EVOLUÇÃO DA TABELA SUBSCRIPTIONS
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled', 'canceled', 'unpaid', 'expired'));

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_price_id UUID REFERENCES public.plan_prices(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS external_subscription_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mock';

-- 4. TABELA DE INTENÇÕES DE CHECKOUT SEGURO (checkout_sessions)
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  plan_price_id UUID NOT NULL REFERENCES public.plan_prices(id),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mock', 'multicaixa', 'paypal')),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired', 'failed')),
  session_reference TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT,
  provider_url TEXT,
  success_url TEXT NOT NULL,
  cancel_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_org ON public.checkout_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_checkout_ref ON public.checkout_sessions(session_reference);

-- 5. TABELA DE FATURAS E DOCUMENTOS FINANCEIROS (invoices)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'paid', 'void', 'refunded')),
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  billing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 6. ITENS DE FATURA (invoice_lines)
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv ON public.invoice_lines(invoice_id);

-- 7. TABELA DO LEDGER FINANCEIRO (DOUBLE-ENTRY) (financial_ledger_entries)
CREATE TABLE IF NOT EXISTS public.financial_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'accounts_receivable', 'revenue', 'cash', 
      'deferred_revenue', 'refund_expense', 'bad_debt', 'ai_cost_expense'
    )
  ),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('invoice', 'payment', 'refund', 'ai_usage', 'manual_adjustment')),
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_ledger_org ON public.financial_ledger_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_ledger_tx ON public.financial_ledger_entries(transaction_id);

-- 8. TABELA DE REEMBOLSOS (refunds)
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_event_id UUID REFERENCES public.payment_events(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('AOA', 'USD', 'EUR', 'BRL')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'failed', 'rejected')),
  external_refund_id TEXT,
  processed_by UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refunds_org ON public.refunds(organization_id);

-- 9. TABELA DE ADMINISTRADORES DA PLATAFORMA (platform_admins)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'billing_admin', 'support_admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. RESERVAS ATÓMICAS DE QUOTA (organization_quota_reserves)
CREATE TABLE IF NOT EXISTS public.organization_quota_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  reserved_quantity NUMERIC(10,2) NOT NULL CHECK (reserved_quantity > 0),
  unit TEXT NOT NULL DEFAULT 'minutes',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quota_reserves_org ON public.organization_quota_reserves(organization_id, status);

-- 11. FUNÇÃO ATÓMICA DE SEQUÊNCIA DE FATURAS
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_org_id UUID, p_year INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seq INTEGER;
  v_num TEXT;
BEGIN
  -- Reutiliza organization_document_sequences com prefixo 'FAT'
  INSERT INTO public.organization_document_sequences (organization_id, year, prefix, last_number)
  VALUES (p_org_id, p_year, 'FAT', 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET
    last_number = organization_document_sequences.last_number + 1,
    updated_at = NOW()
  RETURNING last_number INTO v_seq;

  v_num := 'FAT-' || p_year || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_num;
END;
$$;

-- 12. HABILITAR ROW LEVEL SECURITY (RLS) & GRANTS
GRANT SELECT ON public.plan_prices TO authenticated, anon;
GRANT ALL ON public.checkout_sessions TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoice_lines TO authenticated;
GRANT ALL ON public.financial_ledger_entries TO authenticated;
GRANT ALL ON public.refunds TO authenticated;
GRANT ALL ON public.platform_admins TO authenticated;
GRANT ALL ON public.organization_quota_reserves TO authenticated;

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_quota_reserves ENABLE ROW LEVEL SECURITY;

-- 13. POLÍTICAS RLS

-- A) Plan Prices: Leitura pública para ativos
DROP POLICY IF EXISTS "plan_prices_select" ON public.plan_prices;
CREATE POLICY "plan_prices_select" ON public.plan_prices
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

-- B) Checkout Sessions: Membros da organização podem criar e consultar suas sessões
DROP POLICY IF EXISTS "checkout_sessions_select" ON public.checkout_sessions;
CREATE POLICY "checkout_sessions_select" ON public.checkout_sessions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "checkout_sessions_insert" ON public.checkout_sessions;
CREATE POLICY "checkout_sessions_insert" ON public.checkout_sessions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- C) Invoices & Lines: Leitura por membros, criação/gestão por owners/admins
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

DROP POLICY IF EXISTS "invoices_manage_admin" ON public.invoices;
CREATE POLICY "invoices_manage_admin" ON public.invoices
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "invoice_lines_select" ON public.invoice_lines;
CREATE POLICY "invoice_lines_select" ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices WHERE organization_id IN (SELECT org_id FROM public.current_user_org_ids())
  ));

-- D) Financial Ledger: Consulta restrita a gestores financeiros da organização
DROP POLICY IF EXISTS "fin_ledger_select" ON public.financial_ledger_entries;
CREATE POLICY "fin_ledger_select" ON public.financial_ledger_entries
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- E) Refunds: Visível apenas a administradores da organização
DROP POLICY IF EXISTS "refunds_select" ON public.refunds;
CREATE POLICY "refunds_select" ON public.refunds
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- F) Quota Reserves: Visível a membros da organização
DROP POLICY IF EXISTS "quota_reserves_select" ON public.organization_quota_reserves;
CREATE POLICY "quota_reserves_select" ON public.organization_quota_reserves
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- G) Platform Admins: Apenas utilizadores autenticados podem verificar seu próprio estatuto
DROP POLICY IF EXISTS "platform_admins_select_self" ON public.platform_admins;
CREATE POLICY "platform_admins_select_self" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Triggers anti-tamper
DROP TRIGGER IF EXISTS trg_tamper_checkout ON public.checkout_sessions;
CREATE TRIGGER trg_tamper_checkout BEFORE UPDATE ON public.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

DROP TRIGGER IF EXISTS trg_tamper_invoices ON public.invoices;
CREATE TRIGGER trg_tamper_invoices BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

DROP TRIGGER IF EXISTS trg_tamper_refunds ON public.refunds;
CREATE TRIGGER trg_tamper_refunds BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

DROP TRIGGER IF EXISTS trg_tamper_quota_reserves ON public.organization_quota_reserves;
CREATE TRIGGER trg_tamper_quota_reserves BEFORE UPDATE ON public.organization_quota_reserves
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

-- Imutabilidade do Ledger Financeiro (Proibição estrita de UPDATE e DELETE)
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Modifications or deletions to financial ledger entries are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trigger_financial_ledger_no_update_delete ON public.financial_ledger_entries;
CREATE TRIGGER trigger_financial_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON public.financial_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_ledger_tampering();

-- Imutabilidade dos Eventos de Pagamento (Proibição estrita de DELETE)
CREATE OR REPLACE FUNCTION public.fn_prevent_payment_events_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Deletions of payment events are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trigger_payment_events_no_delete ON public.payment_events;
CREATE TRIGGER trigger_payment_events_no_delete
BEFORE DELETE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_payment_events_deletion();


-- Record migration 20261105000007 in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261105000007', 'phase_6_monetization_and_admin')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

