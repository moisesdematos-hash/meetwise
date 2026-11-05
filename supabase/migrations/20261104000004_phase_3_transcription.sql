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
