import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Phase 4 Real PostgreSQL RLS & Multi-Tenant Intelligence Isolation Audit', () => {
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

    // 2. Apply all 5 migrations in order
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
      '20261104000005_phase_4_intelligence.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  it('verifies all Phase 4 schema enhancements, columns and constraints exist', async () => {
    // 1. Check organization_templates columns
    const tmplCols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organization_templates';
    `);
    const tmplColNames = tmplCols.rows.map((r) => r.column_name);

    expect(tmplColNames).toContain('id');
    expect(tmplColNames).toContain('organization_id');
    expect(tmplColNames).toContain('name');
    expect(tmplColNames).toContain('template_type');
    expect(tmplColNames).toContain('sections');
    expect(tmplColNames).toContain('terminology');
    expect(tmplColNames).toContain('is_default');

    // 2. Check meeting_summaries columns
    const summaryCols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting_summaries';
    `);
    const summaryColNames = summaryCols.rows.map((r) => r.column_name);

    expect(summaryColNames).toContain('brief_summary');
    expect(summaryColNames).toContain('detailed_summary');
    expect(summaryColNames).toContain('next_steps');
    expect(summaryColNames).toContain('risks');
    expect(summaryColNames).toContain('generated_by_model');

    // 3. Check meeting_decisions columns
    const decCols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting_decisions';
    `);
    const decColNames = decCols.rows.map((r) => r.column_name);

    expect(decColNames).toContain('rationale');
    expect(decColNames).toContain('responsible_name');
    expect(decColNames).toContain('status_evidence');
    expect(decColNames).toContain('verified_by');
    expect(decColNames).toContain('verified_at');

    // 4. Check meeting_tasks columns
    const taskCols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting_tasks';
    `);
    const taskColNames = taskCols.rows.map((r) => r.column_name);

    expect(taskColNames).toContain('task_nature');
  });

  it('enforces multi-tenant RLS isolation on minutes, summaries, decisions, tasks, and templates between Org A and Org B', async () => {
    const userA_Id = 'aaaaaaaa-1111-4000-a000-000000000001';
    const userB_Id = 'bbbbbbbb-2222-4000-b000-000000000002';
    const orgA_Id = '11111111-aaaa-4000-a000-000000000001';
    const orgB_Id = '22222222-bbbb-4000-b000-000000000002';

    const meetingA_Id = 'aaaaaaaa-aaaa-4000-a000-00000000000a';
    const minutesA_Id = 'aaaaaaaa-aaaa-4000-a000-00000000000b';
    const templateA_Id = 'aaaaaaaa-aaaa-4000-a000-00000000000c';

    // Seed users, profiles, organizations, and intelligence records as admin
    await db.query(`
      INSERT INTO auth.users (id, email) VALUES
      ('${userA_Id}', 'usera@orga.com'),
      ('${userB_Id}', 'userb@orgb.com')
      ON CONFLICT DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES
      ('${userA_Id}', 'usera@orga.com', 'Admin Org A'),
      ('${userB_Id}', 'userb@orgb.com', 'Admin Org B')
      ON CONFLICT DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
      ('${orgA_Id}', 'Org A Intelligence', 'org-a-intel', '${userA_Id}'),
      ('${orgB_Id}', 'Org B Intelligence', 'org-b-intel', '${userB_Id}')
      ON CONFLICT DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
      ('${orgA_Id}', '${userA_Id}', 'owner', 'active'),
      ('${orgB_Id}', '${userB_Id}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.meetings (id, organization_id, created_by, title, scheduled_at)
      VALUES ('${meetingA_Id}', '${orgA_Id}', '${userA_Id}', 'Reunião Secreta Org A', NOW());
    `);

    await db.query(`
      INSERT INTO public.organization_templates (id, organization_id, name, template_type, created_by)
      VALUES ('${templateA_Id}', '${orgA_Id}', 'Modelo Confidencial A', 'custom', '${userA_Id}');
    `);

    await db.query(`
      INSERT INTO public.meeting_summaries (meeting_id, organization_id, executive_summary, brief_summary)
      VALUES ('${meetingA_Id}', '${orgA_Id}', 'Resumo confidencial de lucros Org A', 'Brief Org A');
    `);

    await db.query(`
      INSERT INTO public.meeting_minutes (id, meeting_id, organization_id, title, content, template_type, review_status)
      VALUES ('${minutesA_Id}', '${meetingA_Id}', '${orgA_Id}', 'Ata Confidencial Org A', 'Texto confidencial Org A', 'formal', 'draft_ai');
    `);

    await db.query(`
      INSERT INTO public.meeting_decisions (meeting_id, organization_id, decision_text, classification, quote)
      VALUES ('${meetingA_Id}', '${orgA_Id}', 'Aprovar aquisição da Org C', 'approved_decision', 'Aprovada a aquisição da Org C');
    `);

    await db.query(`
      INSERT INTO public.meeting_tasks (meeting_id, organization_id, title, priority, status, task_nature)
      VALUES ('${meetingA_Id}', '${orgA_Id}', 'Auditar contas bancárias Org A', 'urgent', 'todo', 'assigned');
    `);

    // Verify Org A can read their own intelligence
    await asUser(userA_Id, async () => {
      const minRes = await db.query(`SELECT * FROM public.meeting_minutes WHERE organization_id = '${orgA_Id}';`);
      expect(minRes.rows.length).toBe(1);

      const tmplRes = await db.query(`SELECT * FROM public.organization_templates WHERE organization_id = '${orgA_Id}';`);
      expect(tmplRes.rows.length).toBe(1);

      const decRes = await db.query(`SELECT * FROM public.meeting_decisions WHERE organization_id = '${orgA_Id}';`);
      expect(decRes.rows.length).toBe(1);

      const taskRes = await db.query(`SELECT * FROM public.meeting_tasks WHERE organization_id = '${orgA_Id}';`);
      expect(taskRes.rows.length).toBe(1);

      const sumRes = await db.query(`SELECT * FROM public.meeting_summaries WHERE organization_id = '${orgA_Id}';`);
      expect(sumRes.rows.length).toBe(1);
    });

    // Verify Org B CANNOT read Org A's intelligence (returns 0 rows)
    await asUser(userB_Id, async () => {
      const minRes = await db.query(`SELECT * FROM public.meeting_minutes WHERE id = '${minutesA_Id}';`);
      expect(minRes.rows.length).toBe(0);

      const tmplRes = await db.query(`SELECT * FROM public.organization_templates WHERE id = '${templateA_Id}';`);
      expect(tmplRes.rows.length).toBe(0);

      const decRes = await db.query(`SELECT * FROM public.meeting_decisions WHERE meeting_id = '${meetingA_Id}';`);
      expect(decRes.rows.length).toBe(0);

      const taskRes = await db.query(`SELECT * FROM public.meeting_tasks WHERE meeting_id = '${meetingA_Id}';`);
      expect(taskRes.rows.length).toBe(0);

      const sumRes = await db.query(`SELECT * FROM public.meeting_summaries WHERE meeting_id = '${meetingA_Id}';`);
      expect(sumRes.rows.length).toBe(0);
    });

    // Verify Org B CANNOT update or delete Org A's minutes
    await asUser(userB_Id, async () => {
      const updateRes = await db.query(`
        UPDATE public.meeting_minutes SET title = 'Ata Invadida por B' WHERE id = '${minutesA_Id}';
      `);
      expect(updateRes.affectedRows).toBe(0);

      const deleteRes = await db.query(`
        DELETE FROM public.meeting_minutes WHERE id = '${minutesA_Id}';
      `);
      expect(deleteRes.affectedRows).toBe(0);
    });

    // Verify Tamper protection trigger on organization_templates
    await asUser(userA_Id, async () => {
      await expect(
        db.query(`
          UPDATE public.organization_templates
          SET organization_id = '${orgB_Id}'
          WHERE id = '${templateA_Id}';
        `)
      ).rejects.toThrowError(/Tampering with organization_id/i);
    });

    // Verify Unauthenticated (anon) access is completely blocked (either 0 rows or permission denied)
    await asUser(null, async () => {
      try {
        const anonMin = await db.query(`SELECT * FROM public.meeting_minutes;`);
        expect(anonMin.rows.length).toBe(0);
      } catch (err: any) {
        expect(err.message).toMatch(/permission denied/i);
      }

      try {
        const anonTmpl = await db.query(`SELECT * FROM public.organization_templates;`);
        expect(anonTmpl.rows.length).toBe(0);
      } catch (err: any) {
        expect(err.message).toMatch(/permission denied/i);
      }
    });

  });
});
