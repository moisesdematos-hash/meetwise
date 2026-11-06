-- ==============================================================================
-- MEETWISE AI — Correção de Políticas RLS: Inserção de Perfis & Onboarding Atómico
-- Migração: 20261106000008_profiles_insert_and_onboarding_fix.sql
-- Motivo: Permite a utilizadores autenticados criar o seu próprio perfil em
--         public.profiles e assegura integridade referencial com organizations.created_by.
-- ==============================================================================

-- 1. Adicionar política de INSERT na tabela profiles para o próprio utilizador autenticado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'profiles_insert_self'
  ) THEN
    CREATE POLICY "profiles_insert_self" ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- 2. Atualizar função RPC create_organization_with_owner para assegurar existência do perfil
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
  v_user_email TEXT;
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

  -- Obter email do utilizador da tabela auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- 1. Assegurar atómicamente que o perfil existe em public.profiles
  INSERT INTO public.profiles (id, email, full_name, locale)
  VALUES (
    v_user_id, 
    COALESCE(v_user_email, 'unknown@meetwise.ai'), 
    COALESCE(trim(p_full_name), 'Utilizador MeetWise'), 
    COALESCE(p_language, 'pt')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(trim(p_full_name), profiles.full_name),
    locale = COALESCE(p_language, profiles.locale),
    updated_at = NOW();

  -- 2. Inserir organização
  INSERT INTO public.organizations (name, slug, created_by, default_language)
  VALUES (trim(p_name), trim(p_slug), v_user_id, COALESCE(p_language, 'pt'))
  RETURNING id INTO v_org_id;

  -- 3. Inserir associação do owner
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, v_user_id, 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = 'owner',
    status = 'active';

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

-- 3. Restrição e concessão de privilégios de execução
REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Registo no histórico nativo de migrações (se a tabela existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20261106000008', '20261106000008_profiles_insert_and_onboarding_fix')
    ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
  END IF;
END $$;
