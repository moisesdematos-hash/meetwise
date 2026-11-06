-- ==============================================================================
-- MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.1-A
-- PLANO DE CONTINGÊNCIA E ROLLBACK DA MIGRAÇÃO 010 (SUPABASE CLOUD STAGING)
-- ==============================================================================
-- Projeto: ycxwomqqepetickmxxqj
-- Versão de Rollback: 20261106000010
-- Objetivo:
-- Caso ocorra qualquer falha durante ou imediatamente após a aplicação da
-- Migração 010 em Staging, este script reverte atomicamente todas as alterações
-- introduzidas pela Migração 010, restaurando o estado exato da Migração 009.
-- ==============================================================================

BEGIN;

-- 1. Reverter RPCs transacionais de quotas criadas na Migração 010
DROP FUNCTION IF EXISTS public.reserve_organization_quota(UUID, NUMERIC, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.release_organization_quota(UUID, TEXT);
DROP FUNCTION IF EXISTS public.settle_organization_quota(UUID, NUMERIC, UUID, TEXT);

-- 2. Restaurar versão prévia da função protect_last_owner() (Migração 002)
-- Remove o bloqueio pessimista FOR UPDATE na organização, retornando à lógica anterior
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SET search_path = public, pg_temp AS $$
DECLARE
  active_owners_count INTEGER;
BEGIN
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

-- 3. Remover registo de histórico da migração 010 se inserido
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    DELETE FROM supabase_migrations.schema_migrations
    WHERE version = '20261106000010';
  END IF;
END $$;

COMMIT;
