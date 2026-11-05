-- ==============================================================================
-- MEETWISE AI — STAGING PART 2: TRANSCRIÇÃO, INTELIGÊNCIA & COLABORAÇÃO
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
