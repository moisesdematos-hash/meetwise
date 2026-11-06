import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE A.1
 * Auditoria de Segurança e Validação Funcional da Migração 008
 * Testes Locais em PostgreSQL descartável (PGlite)
 */
describe('MEETWISE AI — Auditoria de Segurança Migração 008 (profiles_insert & create_organization_with_owner)', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Helper para simular sessões de utilizador autenticado e anónimo
  async function asUser<T>(userId: string | null, callback: () => Promise<T>): Promise<T> {
    if (userId) {
      await db.query(`SET ROLE authenticated;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
    } else {
      await db.query(`SET ROLE anon;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
  }

  const user1Id = '11111111-1111-4111-a111-111111111111';
  const user1Email = 'user1@meetwise.internal';
  const user2Id = '22222222-2222-4222-a222-222222222222';
  const user2Email = 'user2@meetwise.internal';

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup mock Supabase schemas
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      -- Roles padrão do Supabase
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      -- Tabela mock auth.users
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Mock auth.uid()
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      -- Mock storage tables
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
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
      RETURNS TEXT[]
      LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array(name, '/');
      $$;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT SELECT ON auth.users TO authenticated, service_role;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT SELECT ON storage.buckets TO anon, authenticated;
    `);

    // 2. Aplicar migrações 1 a 3 existentes
    const m1 = fs.readFileSync(path.join(migrationsDir, '20261104000001_initial_schema.sql'), 'utf-8');
    await db.exec(m1);

    const m2 = fs.readFileSync(path.join(migrationsDir, '20261104000002_rls_policies.sql'), 'utf-8');
    await db.exec(m2);

    const m3 = fs.readFileSync(path.join(migrationsDir, '20261104000003_storage_and_indexes.sql'), 'utf-8');
    await db.exec(m3);

    // 3. Aplicar Migração 008 objeto da auditoria
    const m8 = fs.readFileSync(path.join(migrationsDir, '20261106000008_profiles_insert_and_onboarding_fix.sql'), 'utf-8');
    await db.exec(m8);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  // TESTE 1: Criar utilizadores sintéticos no schema auth
  it('1. Deve criar utilizadores sintéticos no schema auth.users', async () => {
    await db.query(`
      INSERT INTO auth.users (id, email) VALUES 
        ('${user1Id}', '${user1Email}'),
        ('${user2Id}', '${user2Email}')
      ON CONFLICT (id) DO NOTHING;
    `);

    const res1 = await db.query<any>(`SELECT * FROM auth.users WHERE id = '${user1Id}'`);
    expect(res1.rows.length).toBe(1);
    expect(res1.rows[0].email).toBe(user1Email);
  });

  // TESTE 2: Criar perfil próprio via policy profiles_insert_self
  it('2. Deve permitir ao utilizador autenticado criar o seu próprio perfil via profiles_insert_self', async () => {
    await asUser(user1Id, async () => {
      await db.query(`
        INSERT INTO public.profiles (id, email, full_name, locale)
        VALUES ('${user1Id}', '${user1Email}', 'User One Real Name', 'pt');
      `);

      const profile = await db.query<any>(`SELECT * FROM public.profiles WHERE id = '${user1Id}'`);
      expect(profile.rows.length).toBe(1);
      expect(profile.rows[0].full_name).toBe('User One Real Name');
    });
  });

  // TESTE 3: Rejeitar criação de perfil alheio via policy profiles_insert_self
  it('3. Deve rejeitar estritamente a criação de perfil de outro utilizador (RLS Violation)', async () => {
    await asUser(user1Id, async () => {
      let threw = false;
      try {
        await db.query(`
          INSERT INTO public.profiles (id, email, full_name, locale)
          VALUES ('${user2Id}', '${user2Email}', 'Malicious Impersonator', 'pt');
        `);
      } catch (err: unknown) {
        threw = true;
        const msg = (err as Error).message;
        expect(msg).toMatch(/violates row-level security policy|42501/i);
      }
      expect(threw).toBe(true);
    });

    // Confirmar que o perfil do user 2 NÃO foi criado
    const check = await db.query(`SELECT * FROM public.profiles WHERE id = '${user2Id}'`);
    expect(check.rows.length).toBe(0);
  });

  // TESTE 4: Criar organização via create_organization_with_owner
  it('4. Deve criar organização com sucesso via RPC create_organization_with_owner', async () => {
    await asUser(user1Id, async () => {
      const res = await db.query<any>(`
        SELECT public.create_organization_with_owner(
          'Organização Alpha Test',
          'org-alpha-test',
          'pt',
          'User One Updated Name'
        ) as result;
      `);

      expect(res.rows.length).toBe(1);
      const result = res.rows[0].result as { id: string; name: string; slug: string; role: string };
      expect(result.name).toBe('Organização Alpha Test');
      expect(result.slug).toBe('org-alpha-test');
      expect(result.role).toBe('owner');
      expect(result.id).toBeDefined();

      // Verificar que a organização existe na tabela public.organizations
      const org = await db.query<any>(`SELECT * FROM public.organizations WHERE id = '${result.id}'`);
      expect(org.rows.length).toBe(1);
      expect(org.rows[0].created_by).toBe(user1Id);
    });
  });

  // TESTE 5: Confirmar associação Owner em organization_members
  it('5. Deve confirmar associação de Owner em organization_members para o criador', async () => {
    await asUser(user1Id, async () => {
      const members = await db.query<any>(`
        SELECT om.*, o.name as org_name
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
        WHERE om.user_id = '${user1Id}';
      `);

      expect(members.rows.length).toBe(1);
      expect(members.rows[0].role).toBe('owner');
      expect(members.rows[0].status).toBe('active');
    });
  });

  // TESTE 6: Rejeitar criação de Owner indevido ou chamada anónima da RPC
  it('6. Deve rejeitar chamada da RPC por utilizador anónimo (UNAUTHORIZED)', async () => {
    await asUser(null, async () => {
      let threw = false;
      try {
        await db.query(`
          SELECT public.create_organization_with_owner(
            'Organização Anónima',
            'org-anon',
            'pt',
            'Anonymous User'
          );
        `);
      } catch (err: unknown) {
        threw = true;
        const msg = (err as Error).message;
        expect(msg).toMatch(/UNAUTHORIZED|permission denied/i);
      }
      expect(threw).toBe(true);
    });
  });

  // TESTE 7: Repetir chamada da RPC (Idempotência de perfil e tratamento de conflitos)
  it('7. Deve provisionar perfil automaticamente se ainda não existir e tratar conflito de slug', async () => {
    // User 2 não tem perfil criado previamente
    await asUser(user2Id, async () => {
      // 1. Criar org com slug único
      const res = await db.query<any>(`
        SELECT public.create_organization_with_owner(
          'Organização Beta Test',
          'org-beta-test',
          'pt',
          'User Two Automatic Profile'
        ) as result;
      `);

      const result = res.rows[0].result as { id: string; name: string; slug: string; role: string };
      expect(result.name).toBe('Organização Beta Test');
      expect(result.role).toBe('owner');

      // 2. Verificar que o perfil do User 2 foi atómicamente provisionado pela RPC
      const p2 = await db.query<any>(`SELECT * FROM public.profiles WHERE id = '${user2Id}'`);
      expect(p2.rows.length).toBe(1);
      expect(p2.rows[0].email).toBe(user2Email);

      // 3. Tentar criar outra organização com o mesmo slug 'org-beta-test'
      let dupThrew = false;
      try {
        await db.query(`
          SELECT public.create_organization_with_owner(
            'Organização Beta Duplicada',
            'org-beta-test',
            'pt',
            'User Two'
          );
        `);
      } catch (err: unknown) {
        dupThrew = true;
        const msg = (err as Error).message;
        expect(msg).toMatch(/duplicate key value violates unique constraint|organizations_slug_key/i);
      }
      expect(dupThrew).toBe(true);
    });
  });

  // TESTE 8: Verificar ausência de duplicações de perfil ou membros
  it('8. Deve confirmar ausência de duplicações em profiles e organization_members', async () => {
    const p1Count = await db.query<any>(`SELECT COUNT(*) as c FROM public.profiles WHERE id = '${user1Id}'`);
    expect(Number(p1Count.rows[0].c)).toBe(1);

    const p2Count = await db.query<any>(`SELECT COUNT(*) as c FROM public.profiles WHERE id = '${user2Id}'`);
    expect(Number(p2Count.rows[0].c)).toBe(1);

    const orgsCount = await db.query<any>(`SELECT COUNT(*) as c FROM public.organizations`);
    expect(Number(orgsCount.rows[0].c)).toBe(2); // Org Alpha e Org Beta

    const membersCount = await db.query<any>(`SELECT COUNT(*) as c FROM public.organization_members`);
    expect(Number(membersCount.rows[0].c)).toBe(2); // 1 owner por org
  });

  // TESTE 9: Testar rollback de transação perante falha na RPC
  it('9. Deve garantir atomicidade e rollback completo perante parâmetros inválidos', async () => {
    await asUser(user1Id, async () => {
      let threw = false;
      try {
        await db.query(`
          SELECT public.create_organization_with_owner(
            'X', -- Nome inválido (< 2 caracteres)
            'invalid-slug',
            'pt',
            'User One'
          );
        `);
      } catch (err: unknown) {
        threw = true;
        expect((err as Error).message).toMatch(/VALIDATION_ERROR/);
      }
      expect(threw).toBe(true);

      // Confirmar que nenhuma organização foi criada com 'invalid-slug'
      const check = await db.query(`SELECT * FROM public.organizations WHERE slug = 'invalid-slug'`);
      expect(check.rows.length).toBe(0);
    });
  });

  // TESTE 10: Confirmar que RLS continua ativo e restringe leitura/escrita não autorizada
  it('10. Deve garantir que o isolamento RLS entre organizações Alpha e Beta permanece inviolável', async () => {
    // Obter ID da Org Beta criada pelo User 2
    const betaOrg = await db.query<any>(`SELECT id FROM public.organizations WHERE slug = 'org-beta-test'`);
    const betaOrgId = betaOrg.rows[0].id;

    // Utilizador 1 tenta consultar membros da Org Beta
    await asUser(user1Id, async () => {
      const crossRead = await db.query(`
        SELECT * FROM public.organization_members WHERE organization_id = '${betaOrgId}';
      `);
      // RLS deve bloquear leitura cruzada de membros de outra organização
      expect(crossRead.rows.length).toBe(0);

      // Utilizador 1 tenta inserir-se como membro da Org Beta
      let insertThrew = false;
      try {
        await db.query(`
          INSERT INTO public.organization_members (organization_id, user_id, role, status)
          VALUES ('${betaOrgId}', '${user1Id}', 'member', 'active');
        `);
      } catch (err: unknown) {
        insertThrew = true;
        expect((err as Error).message).toMatch(/violates row-level security policy|42501/i);
      }
      expect(insertThrew).toBe(true);
    });
  });
});
