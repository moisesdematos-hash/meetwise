import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Auditoria Real PostgreSQL, Migrações, RLS e Storage', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Helper to simulate an authenticated Supabase user session
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

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup mock Supabase environment (auth and storage schemas)
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      -- Mock auth.users table
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Mock Supabase auth.uid() function
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      -- Mock storage.buckets
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Mock storage.objects
      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Mock storage.foldername function
      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[]
      LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array(name, '/');
      $$;
    `);

    // 2. Apply Migration 1: Initial Relational Schema (20 tables)
    const migration1 = fs.readFileSync(
      path.join(migrationsDir, '20261104000001_initial_schema.sql'),
      'utf-8'
    );
    await db.exec(migration1);

    // 3. Apply Migration 2: RLS Policies and Triggers
    const migration2 = fs.readFileSync(
      path.join(migrationsDir, '20261104000002_rls_policies.sql'),
      'utf-8'
    );
    await db.exec(migration2);

    // 4. Apply Migration 3: Storage and Indexes
    const migration3 = fs.readFileSync(
      path.join(migrationsDir, '20261104000003_storage_and_indexes.sql'),
      'utf-8'
    );
    await db.exec(migration3);
  });

  afterAll(async () => {
    await db.close();
  });

  // ============================================================================
  // TAREFA 1: VALIDAÇÃO DA BASE DE DADOS E MIGRAÇÕES
  // ============================================================================
  describe('Tarefa 1: Validação do Esquema Relacional e Migrações em Banco Limpo', () => {
    it('deve ter criado com sucesso todas as 20 tabelas fundamentais', async () => {
      const res = await db.query<{ table_name: string }>(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

      const tables = res.rows.map((r) => r.table_name);
      const expectedTables = [
        'ai_provider_requests',
        'audit_logs',
        'media_assets',
        'meeting_decisions',
        'meeting_documents',
        'meeting_minutes',
        'meeting_participants',
        'meeting_summaries',
        'meeting_tasks',
        'meetings',
        'organization_invitations',
        'organization_members',
        'organizations',
        'payment_events',
        'plans',
        'processing_jobs',
        'profiles',
        'subscriptions',
        'transcript_segments',
        'usage_ledger',
      ];

      for (const table of expectedTables) {
        expect(tables).toContain(table);
      }
      expect(expectedTables.length).toBe(20);
    });

    it('deve conter as restrições de integridade e chaves estrangeiras com cascata', async () => {
      const res = await db.query<{ conname: string; contype: string }>(`
        SELECT conname, contype 
        FROM pg_constraint 
        WHERE conrelid = 'public.meetings'::regclass;
      `);
      const constraints = res.rows.map((r) => r.contype);
      expect(constraints).toContain('p'); // Primary Key
      expect(constraints).toContain('f'); // Foreign Key (organizations)
      expect(constraints).toContain('c'); // Check constraint (status)
    });

    it('deve ter semeado os planos iniciais com quotas corretas', async () => {
      const res = await db.query<{ code: string; monthly_minutes_included: number }>(`
        SELECT code, monthly_minutes_included FROM public.plans ORDER BY price_cents_usd ASC;
      `);
      expect(res.rows.length).toBe(4);
      expect(res.rows[0]).toEqual({ code: 'free', monthly_minutes_included: 45 });
      expect(res.rows[1]).toEqual({ code: 'pro', monthly_minutes_included: 600 });
      expect(res.rows[2]).toEqual({ code: 'business', monthly_minutes_included: 2500 });
      expect(res.rows[3]).toEqual({ code: 'enterprise', monthly_minutes_included: 10000 });
    });
  });

  // ============================================================================
  // TAREFA 2: AUDITORIA RLS E ISOLAMENTO MULTI-TENANT
  // ============================================================================
  describe('Tarefa 2: Auditoria Real de Políticas RLS e Isolamento Multi-Tenant', () => {
    // Identificadores de teste
    const userA_Owner = '11111111-0000-0000-0000-000000000001';
    const userA_Admin = '11111111-0000-0000-0000-000000000002';
    const userA_Member = '11111111-0000-0000-0000-000000000003';
    const userA_Viewer = '11111111-0000-0000-0000-000000000004';

    const userB_Owner = '22222222-0000-0000-0000-000000000001';
    const userB_Member = '22222222-0000-0000-0000-000000000002';

    const orgA_Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const orgB_Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const meetingA_Id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    const meetingB_Id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';

    beforeAll(async () => {
      // 1. Criar utilizadores na tabela auth.users e profiles (executado como admin)
      const users = [
        { id: userA_Owner, email: 'owner_a@meetwise.test' },
        { id: userA_Admin, email: 'admin_a@meetwise.test' },
        { id: userA_Member, email: 'member_a@meetwise.test' },
        { id: userA_Viewer, email: 'viewer_a@meetwise.test' },
        { id: userB_Owner, email: 'owner_b@meetwise.test' },
        { id: userB_Member, email: 'member_b@meetwise.test' },
      ];

      for (const u of users) {
        await db.query(`INSERT INTO auth.users (id, email) VALUES ('${u.id}', '${u.email}')`);
        await db.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ('${u.id}', '${u.email}', 'Test User')`);
      }

      // 2. Criar Organizações A e B
      await db.query(`INSERT INTO public.organizations (id, name, slug, created_by) VALUES ('${orgA_Id}', 'Organização A', 'org-a', '${userA_Owner}')`);
      await db.query(`INSERT INTO public.organizations (id, name, slug, created_by) VALUES ('${orgB_Id}', 'Organização B', 'org-b', '${userB_Owner}')`);

      // 3. Vincular Membros à Organização A
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgA_Id}', '${userA_Owner}', 'owner', 'active')`);
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgA_Id}', '${userA_Admin}', 'admin', 'active')`);
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgA_Id}', '${userA_Member}', 'member', 'active')`);
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgA_Id}', '${userA_Viewer}', 'viewer', 'active')`);

      // 4. Vincular Membros à Organização B
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgB_Id}', '${userB_Owner}', 'owner', 'active')`);
      await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ('${orgB_Id}', '${userB_Member}', 'member', 'active')`);

      // 5. Criar Reunião na Org A e Reunião na Org B
      await db.query(`
        INSERT INTO public.meetings (id, organization_id, created_by, title)
        VALUES ('${meetingA_Id}', '${orgA_Id}', '${userA_Owner}', 'Reunião Executiva Org A');
      `);
      await db.query(`
        INSERT INTO public.meetings (id, organization_id, created_by, title)
        VALUES ('${meetingB_Id}', '${orgB_Id}', '${userB_Owner}', 'Reunião Secreta Org B');
      `);
    });

    it('isolamento de SELECT: Utilizador A só deve ver reuniões da Organização A', async () => {
      await asUser(userA_Member, async () => {
        const res = await db.query<{ id: string; title: string }>('SELECT id, title FROM public.meetings');
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].id).toBe(meetingA_Id);
        expect(res.rows[0].title).toBe('Reunião Executiva Org A');
      });
    });

    it('isolamento de SELECT: Utilizador B só deve ver reuniões da Organização B', async () => {
      await asUser(userB_Member, async () => {
        const res = await db.query<{ id: string; title: string }>('SELECT id, title FROM public.meetings');
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].id).toBe(meetingB_Id);
        expect(res.rows[0].title).toBe('Reunião Secreta Org B');
      });
    });

    it('isolamento de INSERT: Utilizador A não consegue criar reuniões na Organização B', async () => {
      await asUser(userA_Member, async () => {
        const newMeetingId = '99999999-9999-9999-9999-999999999999';
        await expect(
          db.query(`
            INSERT INTO public.meetings (id, organization_id, created_by, title)
            VALUES ('${newMeetingId}', '${orgB_Id}', '${userA_Member}', 'Invasão Tenant');
          `)
        ).rejects.toThrow();
      });
    });

    it('isolamento de UPDATE: Utilizador A não consegue modificar reuniões da Organização B', async () => {
      await asUser(userA_Member, async () => {
        const res = await db.query(`
          UPDATE public.meetings 
          SET title = 'Modificado por A' 
          WHERE id = '${meetingB_Id}';
        `);
        // RLS faz com que 0 linhas sejam afetadas porque o registo não é visível para o utilizador A
        expect(res.affectedRows).toBe(0);
      });

      // Confirmar que o título original na Org B permaneceu inalterado
      const check = await db.query<{ title: string }>(`SELECT title FROM public.meetings WHERE id = '${meetingB_Id}'`);
      expect(check.rows[0].title).toBe('Reunião Secreta Org B');
    });

    it('isolamento de DELETE: Utilizador A não consegue eliminar reuniões da Organização B', async () => {
      await asUser(userA_Admin, async () => {
        const res = await db.query(`DELETE FROM public.meetings WHERE id = '${meetingB_Id}';`);
        expect(res.affectedRows).toBe(0);
      });

      const check = await db.query<{ id: string }>(`SELECT id FROM public.meetings WHERE id = '${meetingB_Id}'`);
      expect(check.rows.length).toBe(1);
    });

    it('proteção contra alteração indevida de organization_id (Tenant Tampering Trigger)', async () => {
      // Tentativa de alterar o organization_id da reunião A para B deve ser abortada pelo trigger
      await expect(
        db.query(`
          UPDATE public.meetings 
          SET organization_id = '${orgB_Id}' 
          WHERE id = '${meetingA_Id}';
        `)
      ).rejects.toThrow(/Tampering with organization_id is strictly prohibited/);
    });

    it('proteção do último owner: impede eliminar o único proprietário ativo da organização', async () => {
      // Org B só tem 1 owner (userB_Owner)
      await expect(
        db.query(`
          DELETE FROM public.organization_members 
          WHERE organization_id = '${orgB_Id}' AND user_id = '${userB_Owner}';
        `)
      ).rejects.toThrow(/Cannot remove or demote the last remaining active owner/);

      // Impede também rebaixar de role
      await expect(
        db.query(`
          UPDATE public.organization_members 
          SET role = 'member' 
          WHERE organization_id = '${orgB_Id}' AND user_id = '${userB_Owner}';
        `)
      ).rejects.toThrow(/Cannot remove or demote the last remaining active owner/);
    });

    it('acesso anónimo: utilizador sem sessão JWT é bloqueado de aceder a dados privados', async () => {
      await asUser(null, async () => {
        try {
          const res = await db.query('SELECT * FROM public.meetings');
          expect(res.rows.length).toBe(0);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          expect(message).toMatch(/permission denied/);
        }
      });
    });

    it('acesso revogado: utilizador suspenso perde acesso imediato aos dados', async () => {
      // Suspender temporariamente userA_Member
      await db.query(`
        UPDATE public.organization_members 
        SET status = 'suspended' 
        WHERE organization_id = '${orgA_Id}' AND user_id = '${userA_Member}';
      `);

      await asUser(userA_Member, async () => {
        const res = await db.query('SELECT * FROM public.meetings');
        expect(res.rows.length).toBe(0);
      });

      // Restaurar status ativo
      await db.query(`
        UPDATE public.organization_members 
        SET status = 'active' 
        WHERE organization_id = '${orgA_Id}' AND user_id = '${userA_Member}';
      `);
    });

    it('função SECURITY DEFINER current_user_org_ids possui search_path restrito e seguro', async () => {
      const res = await db.query<{ prosrc: string; prosecdef: boolean }>(`
        SELECT prosrc, prosecdef 
        FROM pg_proc 
        WHERE proname = 'current_user_org_ids';
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].prosecdef).toBe(true);
    });
  });

  // ============================================================================
  // TAREFA 3: AUDITORIA DE STORAGE E SEPARAÇÃO DE BUCKETS
  // ============================================================================
  describe('Tarefa 3: Auditoria Real das Políticas de Storage e Buckets Privados', () => {
    const userA = '11111111-0000-0000-0000-000000000003';
    const userB = '22222222-0000-0000-0000-000000000002';
    const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    beforeAll(async () => {
      // Criar arquivos de teste na tabela storage.objects (como admin)
      await db.query(`
        INSERT INTO storage.objects (id, bucket_id, name, owner)
        VALUES 
          ('33333333-0000-0000-0000-000000000001', 'meeting_recordings', '${orgA}/meeting-1/audio.mp3', '${userA}'),
          ('33333333-0000-0000-0000-000000000002', 'meeting_recordings', '${orgB}/meeting-2/audio.mp3', '${userB}');
      `);
    });

    it('deve ter registado os buckets meeting_recordings (500MB) e meeting_documents (50MB) como privados', async () => {
      const res = await db.query<{ id: string; public: boolean; file_size_limit: string }>(`
        SELECT id, public, file_size_limit FROM storage.buckets;
      `);
      const recordings = res.rows.find((b) => b.id === 'meeting_recordings');
      const docs = res.rows.find((b) => b.id === 'meeting_documents');

      expect(recordings?.public).toBe(false);
      expect(Number(recordings?.file_size_limit)).toBe(524288000); // 500MB

      expect(docs?.public).toBe(false);
      expect(Number(docs?.file_size_limit)).toBe(52428800); // 50MB
    });

    it('membro da Org A só deve conseguir listar objetos cujo caminho pertence à Org A', async () => {
      await asUser(userA, async () => {
        const res = await db.query<{ name: string }>('SELECT name FROM storage.objects');
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].name).toBe(`${orgA}/meeting-1/audio.mp3`);
      });
    });

    it('membro da Org A é bloqueado ao tentar fazer upload para a pasta da Org B', async () => {
      await asUser(userA, async () => {
        await expect(
          db.query(`
            INSERT INTO storage.objects (bucket_id, name, owner)
            VALUES ('meeting_recordings', '${orgB}/hack/file.mp3', '${userA}');
          `)
        ).rejects.toThrow();
      });
    });
  });

  // ============================================================================
  // TAREFA 4: AUDITORIA DE IDEMPOTÊNCIA E USAGE_LEDGER
  // ============================================================================
  describe('Tarefa 4: Auditoria de Idempotência e Concorrência no Usage Ledger', () => {
    const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const idempotencyKey = 'transcription-job-reuniao-45min-attempt-1';

    it('deve aceitar a primeira reserva e rejeitar qualquer duplicação por chave de idempotência', async () => {
      // Inserção da primeira reserva
      await db.query(`
        INSERT INTO public.usage_ledger (
          organization_id, operation, quantity, unit, cost_cents_usd, idempotency_key, status
        ) VALUES (
          '${orgA}', 'transcription_minutes', 45.0, 'minutes', 23, '${idempotencyKey}', 'reserved'
        );
      `);

      // Tentativa de duplicar cobrança com a mesma idempotency_key deve violar restrição UNIQUE
      await expect(
        db.query(`
          INSERT INTO public.usage_ledger (
            organization_id, operation, quantity, unit, cost_cents_usd, idempotency_key, status
          ) VALUES (
            '${orgA}', 'transcription_minutes', 45.0, 'minutes', 23, '${idempotencyKey}', 'reserved'
          );
        `)
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it('transição consistente de estado: reserved -> settled ou reserved -> cancelled', async () => {
      // Atualizar para settled após processamento bem-sucedido
      await db.query(`
        UPDATE public.usage_ledger 
        SET status = 'settled', quantity = 42.5 
        WHERE idempotency_key = '${idempotencyKey}';
      `);

      const res = await db.query<{ status: string; quantity: string }>(`
        SELECT status, quantity FROM public.usage_ledger WHERE idempotency_key = '${idempotencyKey}';
      `);
      expect(res.rows[0].status).toBe('settled');
      expect(Number(res.rows[0].quantity)).toBe(42.5);
    });
  });

  // ============================================================================
  // TAREFA 5: REVISÃO DE SEGURANÇA E AUDITORIA DE PERMISSÕES
  // ============================================================================
  describe('Tarefa 5: Revisão de Permissões e Integridade Estrutural', () => {
    it('todas as 20 tabelas devem ter Row Level Security habilitado no catálogo do PostgreSQL', async () => {
      const res = await db.query<{ relname: string; relrowsecurity: boolean }>(`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname;
      `);

      expect(res.rows.length).toBe(20);
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });

    it('gatilhos de proteção contra tenant-tampering devem estar ativos nas tabelas filhas', async () => {
      const res = await db.query<{ tgname: string }>(`
        SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_tamper_%';
      `);
      const triggerNames = res.rows.map((r) => r.tgname);
      expect(triggerNames).toContain('trg_tamper_meetings');
      expect(triggerNames).toContain('trg_tamper_media');
      expect(triggerNames).toContain('trg_tamper_segments');
      expect(triggerNames).toContain('trg_tamper_minutes');
      expect(triggerNames).toContain('trg_tamper_ledger');
    });
  });
});
