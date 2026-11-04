import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Auditoria Real da Fase 2 (Auth, Onboarding Atómico, Dashboard Multi-Tenant e Segurança)', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Helper para simular identidades autenticadas ou anónimas no motor PostgreSQL
  async function asUser(userId: string | null, callback: () => Promise<void>) {
    if (userId) {
      await db.query(`SET ROLE authenticated;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
    } else {
      await db.query(`SET ROLE anon;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
    try {
      await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
  }

  // IDs de teste imutáveis
  const userA_Owner = '11111111-1111-4111-a111-111111111111';
  const userA_Admin = '22222222-2222-4222-a222-222222222222';
  const userA_Viewer = '33333333-3333-4333-a333-333333333333';
  const userB_Owner = '44444444-4444-4444-a444-444444444444';
  const userB_Member = '55555555-5555-4555-a555-555555555555';

  let orgA_Id: string;
  let orgB_Id: string;

  beforeAll(async () => {
    db = new PGlite();

    // 1. Configurar schema base Supabase Auth
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::JSONB
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[]
      LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array(name, '/');
      $$;
    `);

    // 2. Aplicar as 3 migrações oficiais do MEETWISE AI
    const migration1 = fs.readFileSync(path.join(migrationsDir, '20261104000001_initial_schema.sql'), 'utf8');
    const migration2 = fs.readFileSync(path.join(migrationsDir, '20261104000002_rls_policies.sql'), 'utf8');
    const migration3 = fs.readFileSync(path.join(migrationsDir, '20261104000003_storage_and_indexes.sql'), 'utf8');

    await db.exec(migration1);
    await db.exec(migration2);
    await db.exec(migration3);

    // 3. Pré-registar utilizadores no auth.users e perfis base
    for (const [id, email, name] of [
      [userA_Owner, 'owner.a@empresa-a.pt', 'Dr. António Silva'],
      [userA_Admin, 'admin.a@empresa-a.pt', 'Dra. Beatriz Costa'],
      [userA_Viewer, 'viewer.a@empresa-a.pt', 'Eng. Carlos Viewer'],
      [userB_Owner, 'owner.b@empresa-b.pt', 'Duarte Martins'],
      [userB_Member, 'member.b@empresa-b.pt', 'Eduarda Santos'],
    ]) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}');`);
      await db.query(`
        INSERT INTO public.profiles (id, email, full_name, locale)
        VALUES ('${id}', '${email}', '${name}', 'pt');
      `);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  // ============================================================================
  // TAREFA 2 — AUTENTICAÇÃO REAL & PREVENÇÃO DE ENUMERAÇÃO
  // ============================================================================
  describe('Tarefa 2: Autenticação, Proteção de Sessão e Redirecionamentos', () => {
    it('impede utilizadores anónimos de aceder a dados privados de organizações', async () => {
      await asUser(null, async () => {
        const res = await db.query(`SELECT * FROM public.organizations;`).catch((err: Error) => err);
        // Utilizadores anónimos não têm acesso SELECT na tabela organizations (lança erro de permissão ou retorna 0)
        if (res instanceof Error) {
          expect(res.message).toContain('permission denied');
        } else {
          expect(res.rows.length).toBe(0);
        }

        const profiles = await db.query(`SELECT * FROM public.profiles;`).catch((err: Error) => err);
        if (profiles instanceof Error) {
          expect(profiles.message).toContain('permission denied');
        } else {
          expect(profiles.rows.length).toBe(0);
        }
      });
    });

    it('impede utilizadores anónimos de inserir organizações diretamente', async () => {
      await asUser(null, async () => {
        const res = await db.query(`
          INSERT INTO public.organizations (name, slug, created_by)
          VALUES ('Anon Org', 'anon-org', '${userA_Owner}');
        `).catch((err: Error) => err);

        expect(res).toBeInstanceOf(Error);
      });
    });

    it('valida redirecionamentos seguros prevenindo Open Redirect attacks', () => {
      const isSafeRedirect = (url: string | null): boolean => {
        if (!url) return false;
        // Permite apenas caminhos relativos legítimos começando com / e sem esquema ou protocolo
        if (url.startsWith('//') || url.includes('://') || url.startsWith('javascript:')) {
          return false;
        }
        return url.startsWith('/');
      };

      expect(isSafeRedirect('/dashboard')).toBe(true);
      expect(isSafeRedirect('/meetings/123')).toBe(true);
      expect(isSafeRedirect('https://evil.com')).toBe(false);
      expect(isSafeRedirect('//evil.com/fake')).toBe(false);
      expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    });
  });

  // ============================================================================
  // TAREFA 3 — ONBOARDING ATÓMICO E ACID
  // ============================================================================
  describe('Tarefa 3: Onboarding Atómico, Triggers e Prevenção de Órfãos', () => {
    it('executa onboarding atómico completo através da função RPC create_organization_with_owner', async () => {
      await asUser(userA_Owner, async () => {
        const rpcRes = await db.query<{ create_organization_with_owner: { id: string; name: string; role: string } }>(`
          SELECT public.create_organization_with_owner(
            'Empresa Alfa Lda',
            'empresa-alfa',
            'pt',
            'Dr. António Silva'
          );
        `);

        const result = rpcRes.rows[0].create_organization_with_owner;
        expect(result).toBeDefined();
        expect(result.name).toBe('Empresa Alfa Lda');
        expect(result.role).toBe('owner');
        orgA_Id = result.id;

        // Verificar que o perfil foi atualizado
        const profile = await db.query<{ full_name: string }>(`
          SELECT full_name FROM public.profiles WHERE id = '${userA_Owner}';
        `);
        expect(profile.rows[0].full_name).toBe('Dr. António Silva');

        // Verificar que o utilizador foi associado atomicamente como owner
        const memberRes = await db.query<{ role: string; status: string }>(`
          SELECT role, status FROM public.organization_members
          WHERE organization_id = '${orgA_Id}' AND user_id = '${userA_Owner}';
        `);

        expect(memberRes.rows.length).toBe(1);
        expect(memberRes.rows[0].role).toBe('owner');
        expect(memberRes.rows[0].status).toBe('active');
      });
    });

    it('permite criação sequencial de organização com política de primeiro proprietário', async () => {
      await asUser(userB_Owner, async () => {
        const res = await db.query<{ id: string; name: string }>(`
          INSERT INTO public.organizations (name, slug, created_by, default_language)
          VALUES ('Beta Soluções Globais', 'beta-solucoes', '${userB_Owner}', 'pt')
          RETURNING id, name;
        `);

        expect(res.rows.length).toBe(1);
        orgB_Id = res.rows[0].id;

        // Criar o primeiro owner usando a política permitida
        await db.query(`
          INSERT INTO public.organization_members (organization_id, user_id, role, status)
          VALUES ('${orgB_Id}', '${userB_Owner}', 'owner', 'active');
        `);

        const member = await db.query<{ role: string }>(`
          SELECT role FROM public.organization_members
          WHERE organization_id = '${orgB_Id}' AND user_id = '${userB_Owner}';
        `);
        expect(member.rows[0].role).toBe('owner');
      });
    });

    it('impede criação de organizações com slugs duplicados garantindo rollback transacional', async () => {
      await asUser(userA_Owner, async () => {
        const duplicateAttempt = await db.query(`
          INSERT INTO public.organizations (name, slug, created_by)
          VALUES ('Alfa Duplicada', 'empresa-alfa', '${userA_Owner}');
        `).catch((err: Error) => err);

        expect(duplicateAttempt).toBeInstanceOf(Error);
        expect((duplicateAttempt as Error).message).toContain('duplicate key value');
      });
    });

    it('impede utilizador de forjar created_by apontando para outro utilizador', async () => {
      await asUser(userA_Owner, async () => {
        // Tentar criar com created_by = userB_Owner deve ser barrado pela policy org_insert_auth
        const forgeAttempt = await db.query(`
          INSERT INTO public.organizations (name, slug, created_by)
          VALUES ('Tentativa Fraude', 'slug-fraude', '${userB_Owner}');
        `).catch((err: Error) => err);

        expect(forgeAttempt).toBeInstanceOf(Error);
      });
    });
  });

  // ============================================================================
  // TAREFA 4 — DASHBOARD MULTI-TENANT & ISOLAMENTO RIGOROSO
  // ============================================================================
  describe('Tarefa 4: Isolamento Multi-Tenant Rigoroso (Org A vs Org B) e RBAC', () => {
    beforeAll(async () => {
      // Adicionar membros adicionais na Org A e Org B
      await asUser(userA_Owner, async () => {
        await db.query(`
          INSERT INTO public.organization_members (organization_id, user_id, role, status)
          VALUES
            ('${orgA_Id}', '${userA_Admin}', 'admin', 'active'),
            ('${orgA_Id}', '${userA_Viewer}', 'viewer', 'active');
        `);

        // Criar reuniões e tarefas na Org A
        await db.query(`
          INSERT INTO public.meetings (id, organization_id, title, created_by, status)
          VALUES
            ('aaaaaaaa-1111-4000-a000-000000000001', '${orgA_Id}', 'Reunião Direção Org A', '${userA_Owner}', 'completed'),
            ('aaaaaaaa-1111-4000-a000-000000000002', '${orgA_Id}', 'Alinhamento Técnico Org A', '${userA_Owner}', 'processing');
        `);

        await db.query(`
          INSERT INTO public.meeting_tasks (meeting_id, organization_id, title, status)
          VALUES ('aaaaaaaa-1111-4000-a000-000000000001', '${orgA_Id}', 'Tarefa Confidencial Org A', 'todo');
        `);
      });

      await asUser(userB_Owner, async () => {
        await db.query(`
          INSERT INTO public.organization_members (organization_id, user_id, role, status)
          VALUES ('${orgB_Id}', '${userB_Member}', 'member', 'active');
        `);

        // Criar reunião na Org B
        await db.query(`
          INSERT INTO public.meetings (id, organization_id, title, created_by, status)
          VALUES ('bbbbbbbb-2222-4000-b000-000000000001', '${orgB_Id}', 'Planeamento Org B', '${userB_Owner}', 'completed');
        `);

        await db.query(`
          INSERT INTO public.meeting_tasks (meeting_id, organization_id, title, status)
          VALUES ('bbbbbbbb-2222-4000-b000-000000000001', '${orgB_Id}', 'Tarefa Privada Org B', 'in_progress');
        `);
      });
    });

    it('garante que utilizador da Org A apenas vê reuniões da Org A (zero fuga para Org B)', async () => {
      await asUser(userA_Owner, async () => {
        const meetings = await db.query<{ title: string; organization_id: string }>(`
          SELECT title, organization_id FROM public.meetings;
        `);

        expect(meetings.rows.length).toBe(2);
        meetings.rows.forEach(m => {
          expect(m.organization_id).toBe(orgA_Id);
          expect(m.title).toContain('Org A');
        });
      });
    });

    it('garante que utilizador da Org B apenas vê dados da Org B', async () => {
      await asUser(userB_Member, async () => {
        const meetings = await db.query<{ title: string; organization_id: string }>(`
          SELECT title, organization_id FROM public.meetings;
        `);

        expect(meetings.rows.length).toBe(1);
        expect(meetings.rows[0].organization_id).toBe(orgB_Id);
        expect(meetings.rows[0].title).toBe('Planeamento Org B');

        // Tarefas da Org A devem ser totalmente invisíveis
        const tasks = await db.query<{ title: string }>(`SELECT * FROM public.meeting_tasks;`);
        expect(tasks.rows.length).toBe(1);
        expect(tasks.rows[0].title).toBe('Tarefa Privada Org B');
      });
    });

    it('valida permissões RBAC: Viewer tem acesso de leitura mas é impedido de criar tarefas', async () => {
      await asUser(userA_Viewer, async () => {
        // Leitura permitida
        const readMeetings = await db.query(`SELECT * FROM public.meetings;`);
        expect(readMeetings.rows.length).toBe(2);

        // Escrita proibida para viewer
        const writeAttempt = await db.query(`
          INSERT INTO public.meeting_tasks (meeting_id, organization_id, title, status)
          VALUES ('aaaaaaaa-1111-4000-a000-000000000001', '${orgA_Id}', 'Tentativa Viewer', 'todo');
        `).catch((err: Error) => err);

        expect(writeAttempt).toBeInstanceOf(Error);
      });
    });

    it('revoga imediatamente o acesso aos dados da organização quando um membro é removido', async () => {
      // 1. Remover utilizador Viewer da Org A
      await asUser(userA_Owner, async () => {
        await db.query(`
          DELETE FROM public.organization_members
          WHERE organization_id = '${orgA_Id}' AND user_id = '${userA_Viewer}';
        `);
      });

      // 2. Tentar aceder aos dados sob identidade do Viewer removido
      await asUser(userA_Viewer, async () => {
        const meetingsAfterRevoke = await db.query(`SELECT * FROM public.meetings;`);
        expect(meetingsAfterRevoke.rows.length).toBe(0);

        const orgsAfterRevoke = await db.query(`SELECT * FROM public.organizations;`);
        expect(orgsAfterRevoke.rows.length).toBe(0);
      });
    });

    it('isola o cálculo de métricas entre organizações distintas', async () => {
      await asUser(userA_Owner, async () => {
        const countA = await db.query<{ count: string }>(`
          SELECT count(*) as count FROM public.meetings;
        `);
        expect(parseInt(countA.rows[0].count, 10)).toBe(2);
      });

      await asUser(userB_Owner, async () => {
        const countB = await db.query<{ count: string }>(`
          SELECT count(*) as count FROM public.meetings;
        `);
        expect(parseInt(countB.rows[0].count, 10)).toBe(1);
      });
    });
  });

  // ============================================================================
  // TAREFA 6 — AUDITORIA DE SEGURANÇA, TAMPERING E ÚLTIMO OWNER
  // ============================================================================
  describe('Tarefa 6: Segurança Avançada, Triggers de Tampering e Último Owner', () => {
    it('impede a alteração forjada de organization_id em tabelas filhas (Anti-Tampering)', async () => {
      await asUser(userA_Owner, async () => {
        // Tentar transferir uma reunião da Org A para a Org B
        const tamperAttempt = await db.query(`
          UPDATE public.meetings
          SET organization_id = '${orgB_Id}'
          WHERE id = 'aaaaaaaa-1111-4000-a000-000000000001';
        `).catch((err: Error) => err);

        expect(tamperAttempt).toBeInstanceOf(Error);
        expect((tamperAttempt as Error).message).toContain('Tampering with organization_id is strictly prohibited');
      });
    });

    it('impede a remoção ou demissão do último proprietário ativo (Protect Last Owner)', async () => {
      await asUser(userB_Owner, async () => {
        // Na Org B só existe 1 owner (userB_Owner). Tentar apagar deve falhar
        const deleteLastOwner = await db.query(`
          DELETE FROM public.organization_members
          WHERE organization_id = '${orgB_Id}' AND user_id = '${userB_Owner}';
        `).catch((err: Error) => err);

        expect(deleteLastOwner).toBeInstanceOf(Error);
        expect((deleteLastOwner as Error).message).toContain('Cannot remove or demote the last remaining active owner');

        // Tentar despromover para viewer também deve falhar
        const demoteLastOwner = await db.query(`
          UPDATE public.organization_members
          SET role = 'viewer'
          WHERE organization_id = '${orgB_Id}' AND user_id = '${userB_Owner}';
        `).catch((err: Error) => err);

        expect(demoteLastOwner).toBeInstanceOf(Error);
        expect((demoteLastOwner as Error).message).toContain('Cannot remove or demote the last remaining active owner');
      });
    });

    it('garante que todas as funções SECURITY DEFINER possuem search_path fixo e seguro', async () => {
      const secDefFunctions = await db.query<{ proname: string; proconfig: string[] | null }>(`
        SELECT proname, proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true;
      `);

      expect(secDefFunctions.rows.length).toBeGreaterThan(0);
      secDefFunctions.rows.forEach(fn => {
        expect(fn.proconfig).not.toBeNull();
        const hasSearchPath = fn.proconfig?.some(cfg => cfg.startsWith('search_path='));
        expect(hasSearchPath).toBe(true);
      });
    });
  });
});
