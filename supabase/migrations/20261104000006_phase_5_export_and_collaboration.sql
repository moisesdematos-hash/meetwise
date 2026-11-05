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

CREATE TRIGGER trg_doc_seq_updated_at
BEFORE UPDATE ON public.organization_document_sequences
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_seq ON public.organization_document_sequences;
CREATE TRIGGER trg_tamper_doc_seq
BEFORE UPDATE ON public.organization_document_sequences
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.organization_document_sequences TO authenticated, service_role;
ALTER TABLE public.organization_document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_seq_select" ON public.organization_document_sequences
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

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

CREATE POLICY "doc_versions_select" ON public.meeting_document_versions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

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

CREATE TRIGGER trg_doc_comments_updated_at
BEFORE UPDATE ON public.meeting_document_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_comments ON public.meeting_document_comments;
CREATE TRIGGER trg_tamper_doc_comments
BEFORE UPDATE ON public.meeting_document_comments
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.meeting_document_comments TO authenticated, service_role;
ALTER TABLE public.meeting_document_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_comments_select" ON public.meeting_document_comments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "doc_comments_insert" ON public.meeting_document_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor', 'viewer'))
  );

CREATE POLICY "doc_comments_update" ON public.meeting_document_comments
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

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

CREATE TRIGGER trg_doc_shares_updated_at
BEFORE UPDATE ON public.meeting_document_shares
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_tamper_doc_shares ON public.meeting_document_shares;
CREATE TRIGGER trg_tamper_doc_shares
BEFORE UPDATE ON public.meeting_document_shares
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();

GRANT ALL ON TABLE public.meeting_document_shares TO authenticated, service_role;
ALTER TABLE public.meeting_document_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_shares_select" ON public.meeting_document_shares
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "doc_shares_insert" ON public.meeting_document_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor'))
  );

CREATE POLICY "doc_shares_update" ON public.meeting_document_shares
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'editor')));

CREATE POLICY "doc_shares_delete" ON public.meeting_document_shares
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));
