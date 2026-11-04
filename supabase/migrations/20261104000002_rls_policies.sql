-- ==============================================================================
-- MEETWISE AI — Multi-Tenant Row Level Security & RBAC Protection
-- Migration: 20261104000002_rls_policies.sql
-- Description: Enables strict Row Level Security on all tenant tables,
--              defines SECURITY DEFINER helper functions with search_path protection,
--              and attaches triggers to prevent tenant tampering and last-owner deletion.
-- ==============================================================================

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

-- Restrict execute privilege to authenticated users
REVOKE ALL ON FUNCTION public.current_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO authenticated, service_role;

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

CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- Attach tenant-tampering triggers to all child tables
CREATE TRIGGER trg_tamper_meetings BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_participants BEFORE UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_media BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_jobs BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_segments BEFORE UPDATE ON public.transcript_segments FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_summaries BEFORE UPDATE ON public.meeting_summaries FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_minutes BEFORE UPDATE ON public.meeting_minutes FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_decisions BEFORE UPDATE ON public.meeting_decisions FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_tasks BEFORE UPDATE ON public.meeting_tasks FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
CREATE TRIGGER trg_tamper_documents BEFORE UPDATE ON public.meeting_documents FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
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
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. ORGANIZATIONS
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "org_insert_auth" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "org_update_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

CREATE POLICY "org_delete_owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role = 'owner'));

-- 3. ORGANIZATION MEMBERS
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "org_members_insert_admin" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin'))
    OR
    -- Allow the organization creator to add themselves as first owner
    (user_id = auth.uid() AND role = 'owner' AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id
    ))
  );

CREATE POLICY "org_members_update_admin" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

CREATE POLICY "org_members_delete_admin" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin'))
    OR user_id = auth.uid() -- Member can voluntarily leave the organization
  );

-- 4. ORGANIZATION INVITATIONS
CREATE POLICY "invitations_select" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "invitations_manage_admin" ON public.organization_invitations
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 5. MEETINGS
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))
    AND created_by = auth.uid()
  );

CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 6. MEETING PARTICIPANTS
CREATE POLICY "participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "participants_write" ON public.meeting_participants
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 7. MEDIA ASSETS
CREATE POLICY "media_select" ON public.media_assets
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "media_insert" ON public.media_assets
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

CREATE POLICY "media_delete" ON public.media_assets
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 8. PROCESSING JOBS (Managed primarily by background worker via service_role)
CREATE POLICY "jobs_select" ON public.processing_jobs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- 9. TRANSCRIPT SEGMENTS
CREATE POLICY "segments_select" ON public.transcript_segments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "segments_write" ON public.transcript_segments
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 10. MEETING SUMMARIES
CREATE POLICY "summaries_select" ON public.meeting_summaries
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "summaries_write" ON public.meeting_summaries
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 11. MEETING MINUTES
CREATE POLICY "minutes_select" ON public.meeting_minutes
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "minutes_write" ON public.meeting_minutes
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 12. MEETING DECISIONS
CREATE POLICY "decisions_select" ON public.meeting_decisions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "decisions_write" ON public.meeting_decisions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 13. MEETING TASKS
CREATE POLICY "tasks_select" ON public.meeting_tasks
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "tasks_write" ON public.meeting_tasks
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 14. MEETING DOCUMENTS
CREATE POLICY "documents_select" ON public.meeting_documents
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "documents_write" ON public.meeting_documents
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')));

-- 15. PLANS (Public read for authenticated users)
CREATE POLICY "plans_select_all" ON public.plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- 16. SUBSCRIPTIONS
CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

CREATE POLICY "subscriptions_manage_owner" ON public.subscriptions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 17. USAGE LEDGER (Auditable by org members, mutable only via service role / backend)
CREATE POLICY "usage_ledger_select" ON public.usage_ledger
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));

-- 18. PAYMENT EVENTS
CREATE POLICY "payments_select_admin" ON public.payment_events
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 19. AI PROVIDER REQUESTS
CREATE POLICY "ai_requests_select_admin" ON public.ai_provider_requests
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

-- 20. AUDIT LOGS (Strict Append-Only for Audit Integrity)
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT org_id FROM public.current_user_org_ids() WHERE role IN ('owner', 'admin')));

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT org_id FROM public.current_user_org_ids()));
