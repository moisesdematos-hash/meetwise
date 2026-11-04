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


CREATE POLICY "templates_select" ON public.organization_templates
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

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

