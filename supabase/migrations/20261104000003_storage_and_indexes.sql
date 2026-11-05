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
      CREATE POLICY "storage_select_org_member" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id IN ('meeting_recordings', 'meeting_documents') AND
          (storage.foldername(name))[1]::UUID IN (SELECT org_id FROM public.current_user_org_ids())
        );

      -- INSERT: Member with upload permissions can upload to their active organization folder
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
