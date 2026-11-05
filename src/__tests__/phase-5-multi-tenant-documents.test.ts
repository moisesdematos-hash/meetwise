import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Phase 5 PostgreSQL RLS Multi-Tenant Document Security Audit', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

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

    // 1. Setup mock Supabase environment
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
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name text)
      RETURNS text[]
      LANGUAGE plpgsql IMMUTABLE AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;
    `);

    // 2. Apply all 6 migrations in sequence
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
      '20261104000005_phase_4_intelligence.sql',
      '20261104000006_phase_5_export_and_collaboration.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  it('verifies all Phase 5 tables, columns, and numbering function exist', async () => {
    // 1. Check organization_document_sequences table
    const seqTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'organization_document_sequences';
    `);
    expect(seqTable.rows).toHaveLength(1);

    // 2. Check meeting_document_versions table
    const verTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'meeting_document_versions';
    `);
    expect(verTable.rows).toHaveLength(1);

    // 3. Check meeting_document_comments table
    const commTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'meeting_document_comments';
    `);
    expect(commTable.rows).toHaveLength(1);

    // 4. Check meeting_document_shares table
    const shareTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'meeting_document_shares';
    `);
    expect(shareTable.rows).toHaveLength(1);

    // 5. Check document_number and export_status on meeting_minutes
    const minutesCols = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'meeting_minutes';
    `);
    const minutesColNames = minutesCols.rows.map((r) => r.column_name);
    expect(minutesColNames).toContain('document_number');
    expect(minutesColNames).toContain('export_status');
    expect(minutesColNames).toContain('assigned_reviewer_id');
  });

  it('verifies multi-tenant isolation and anti-tamper triggers for document versions and shares', async () => {
    const userA_Id = '11111111-1111-4111-a111-111111111111';
    const userB_Id = '22222222-2222-4222-a222-222222222222';
    const orgA_Id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const orgB_Id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

    // Seed users and organizations as admin
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${userA_Id}', 'usera@orga.com'),
        ('${userB_Id}', 'userb@orgb.com')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name) VALUES
        ('${userA_Id}', 'usera@orga.com', 'User A'),
        ('${userB_Id}', 'userb@orgb.com', 'User B')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
        ('${orgA_Id}', 'Org A', 'org-a', '${userA_Id}'),
        ('${orgB_Id}', 'Org B', 'org-b', '${userB_Id}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
        ('${orgA_Id}', '${userA_Id}', 'owner', 'active'),
        ('${orgB_Id}', '${userB_Id}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    // Test get_next_document_number function
    const docNumResult = await db.query<{ get_next_document_number: string }>(`
      SELECT public.get_next_document_number('${orgA_Id}', 2026, 'ATA');
    `);
    expect(docNumResult.rows[0].get_next_document_number).toBe('ATA-2026-001');

    const docNumResult2 = await db.query<{ get_next_document_number: string }>(`
      SELECT public.get_next_document_number('${orgA_Id}', 2026, 'ATA');
    `);
    expect(docNumResult2.rows[0].get_next_document_number).toBe('ATA-2026-002');

    // Create a meeting and minute for Org A
    const meetA_Id = '33333333-3333-4333-a333-333333333333';
    const minA_Id = '44444444-4444-4444-a444-444444444444';

    await asUser(userA_Id, async () => {
      await db.exec(`
        INSERT INTO public.meetings (id, organization_id, title, created_by)
        VALUES ('${meetA_Id}', '${orgA_Id}', 'Reunião Secreta Org A', '${userA_Id}');

        INSERT INTO public.meeting_minutes (id, meeting_id, organization_id, title, content, document_number)
        VALUES ('${minA_Id}', '${meetA_Id}', '${orgA_Id}', 'Ata Confidencial Org A', 'Conteúdo restrito Org A', 'ATA-2026-001');

        INSERT INTO public.meeting_document_versions (organization_id, meeting_id, minutes_id, version, title, content, review_status)
        VALUES ('${orgA_Id}', '${meetA_Id}', '${minA_Id}', 1, 'Ata Confidencial Org A', 'Conteúdo restrito', 'draft_ai');

        INSERT INTO public.meeting_document_comments (organization_id, meeting_id, minutes_id, user_id, content)
        VALUES ('${orgA_Id}', '${meetA_Id}', '${minA_Id}', '${userA_Id}', 'Comentário confidencial de A');

        INSERT INTO public.meeting_document_shares (organization_id, meeting_id, minutes_id, version, token_hash, created_by, expires_at)
        VALUES ('${orgA_Id}', '${meetA_Id}', '${minA_Id}', 1, 'hash_a_secret_123', '${userA_Id}', NOW() + INTERVAL '1 day');
      `);
    });

    // Verify User B CANNOT see Org A's document versions, comments, or shares
    await asUser(userB_Id, async () => {
      const verB = await db.query(`SELECT * FROM public.meeting_document_versions WHERE organization_id = '${orgA_Id}';`);
      expect(verB.rows).toHaveLength(0);

      const commB = await db.query(`SELECT * FROM public.meeting_document_comments WHERE organization_id = '${orgA_Id}';`);
      expect(commB.rows).toHaveLength(0);

      const shareB = await db.query(`SELECT * FROM public.meeting_document_shares WHERE organization_id = '${orgA_Id}';`);
      expect(shareB.rows).toHaveLength(0);
    });

    // Verify Anti-Tamper Trigger on meeting_document_comments
    await asUser(userA_Id, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.meeting_document_comments
          SET organization_id = '${orgB_Id}'
          WHERE minutes_id = '${minA_Id}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Tampering with organization_id/i);
      }
      expect(threw).toBe(true);
    });
  });
});
