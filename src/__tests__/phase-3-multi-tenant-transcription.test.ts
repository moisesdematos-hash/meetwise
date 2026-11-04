import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Phase 3 Real Multi-Tenant PostgreSQL RLS & Transcription Isolation Audit', () => {
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

    // 2. Apply all migrations in order
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  it('should verify all Phase 3 tables and columns exist', async () => {
    // Check transcript_segments columns
    const cols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transcript_segments';
    `);
    const colNames = cols.rows.map((r) => r.column_name);

    expect(colNames).toContain('is_edited');
    expect(colNames).toContain('original_text');
    expect(colNames).toContain('updated_at');
    expect(colNames).toContain('speaker_label');
    expect(colNames).toContain('start_time');
    expect(colNames).toContain('end_time');

    // Check meetings columns
    const meetCols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meetings';
    `);
    const meetColNames = meetCols.rows.map((r) => r.column_name);

    expect(meetColNames).toContain('transcription_review_status');
    expect(meetColNames).toContain('reviewed_by');
    expect(meetColNames).toContain('reviewed_at');
  });

  it('should enforce strict multi-tenant isolation on media, transcripts and jobs between Org A and Org B', async () => {
    const userA_Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userB_Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const orgA_Id = '11111111-1111-1111-1111-111111111111';
    const orgB_Id = '22222222-2222-2222-2222-222222222222';

    // Seed users and profiles
    await db.query(`
      INSERT INTO auth.users (id, email) VALUES
      ('${userA_Id}', 'usera@meetwise.ai'),
      ('${userB_Id}', 'userb@meetwise.ai')
      ON CONFLICT DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES
      ('${userA_Id}', 'usera@meetwise.ai', 'User A'),
      ('${userB_Id}', 'userb@meetwise.ai', 'User B')
      ON CONFLICT DO NOTHING;
    `);

    // Seed Organizations A and B
    await db.query(`
      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
      ('${orgA_Id}', 'Org Alpha', 'org-alpha-p3', '${userA_Id}'),
      ('${orgB_Id}', 'Org Beta', 'org-beta-p3', '${userB_Id}')
      ON CONFLICT DO NOTHING;
    `);

    // Seed Organization Members
    await db.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
      ('${orgA_Id}', '${userA_Id}', 'owner', 'active'),
      ('${orgB_Id}', '${userB_Id}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    let meetingA_Id = '';
    let mediaA_Id = '';
    let segmentA_Id = '';

    // As User A: create meeting, media asset, job, segments, and participants in Org A
    await asUser(userA_Id, async () => {
      const meetRes = await db.query<{ id: string }>(`
        INSERT INTO public.meetings (
          organization_id, created_by, title, description, status, language
        ) VALUES (
          '${orgA_Id}', '${userA_Id}', 'Reunião Secreta Alpha', 'Confidencial Org A', 'created', 'pt'
        ) RETURNING id;
      `);
      meetingA_Id = meetRes.rows[0].id;

      const mediaRes = await db.query<{ id: string }>(`
        INSERT INTO public.media_assets (
          meeting_id, organization_id, storage_bucket, storage_path,
          original_filename, mime_type, file_size_bytes, duration_seconds
        ) VALUES (
          '${meetingA_Id}', '${orgA_Id}', 'meeting_recordings',
          '${orgA_Id}/${meetingA_Id}/audio.mp3', 'audio.mp3', 'audio/mpeg', 1048576, 120
        ) RETURNING id;
      `);
      mediaA_Id = mediaRes.rows[0].id;

      const segRes = await db.query<{ id: string }>(`
        INSERT INTO public.transcript_segments (
          meeting_id, organization_id, speaker_label, start_time, end_time, text, confidence
        ) VALUES (
          '${meetingA_Id}', '${orgA_Id}', 'Orador 1', 0.000, 5.000, 'Dados estratégicos Confidenciais Org A', 0.990
        ), (
          '${meetingA_Id}', '${orgA_Id}', 'Orador 2', 5.500, 10.000, 'Confirmo os números secretos.', 0.980
        ) RETURNING id;
      `);
      segmentA_Id = segRes.rows[0].id;

      await db.query(`
        INSERT INTO public.meeting_participants (
          meeting_id, organization_id, name, speaker_label
        ) VALUES (
          '${meetingA_Id}', '${orgA_Id}', 'Diretor Alpha', 'Orador 1'
        );
      `);
    });

    // Background worker insert for processing_jobs (service_role)
    await db.query(`
      INSERT INTO public.processing_jobs (
        organization_id, meeting_id, operation, status, idempotency_key
      ) VALUES (
        '${orgA_Id}', '${meetingA_Id}', 'transcription', 'completed', 'transcribe_p3_${meetingA_Id}'
      );
    `);

    // As User B: Attempt cross-tenant reads and attacks on Org A data
    await asUser(userB_Id, async () => {
      // 1. SELECT transcript_segments of Org A
      const crossSegs = await db.query(`
        SELECT * FROM public.transcript_segments WHERE meeting_id = '${meetingA_Id}';
      `);
      expect(crossSegs.rows.length).toBe(0);

      // 2. UPDATE segment of Org A
      const updateAttack = await db.query(`
        UPDATE public.transcript_segments
        SET text = 'Texto adulterado por invasor'
        WHERE id = '${segmentA_Id}';
      `);
      expect(updateAttack.rowCount).toBe(0);

      // 3. DELETE segment of Org A
      const deleteAttack = await db.query(`
        DELETE FROM public.transcript_segments WHERE id = '${segmentA_Id}';
      `);
      expect(deleteAttack.rowCount).toBe(0);

      // 4. SELECT media_assets of Org A
      const crossMedia = await db.query(`
        SELECT * FROM public.media_assets WHERE id = '${mediaA_Id}';
      `);
      expect(crossMedia.rows.length).toBe(0);

      // 5. SELECT processing_jobs of Org A
      const crossJobs = await db.query(`
        SELECT * FROM public.processing_jobs WHERE meeting_id = '${meetingA_Id}';
      `);
      expect(crossJobs.rows.length).toBe(0);

      // 6. Attempt rename_meeting_speaker on Org A meeting
      await expect(
        db.query(`
          SELECT public.rename_meeting_speaker(
            '${meetingA_Id}'::UUID,
            'Orador 1',
            'Hacker Invasor'
          );
        `)
      ).rejects.toThrow('access denied');
    });

    // As User A: Verify speaker renaming, segment edits and review status work correctly
    await asUser(userA_Id, async () => {
      // 1. Execute rename_meeting_speaker
      const renameRes = await db.query<{ rename_meeting_speaker: number }>(`
        SELECT public.rename_meeting_speaker(
          '${meetingA_Id}'::UUID,
          'Orador 1',
          'Dr. Carlos Mendes (CEO)',
          'Dr. Carlos Mendes'
        );
      `);
      expect(renameRes.rows[0].rename_meeting_speaker).toBe(1);

      // Verify updated segment
      const updatedSegs = await db.query<{ speaker_label: string; text: string }>(`
        SELECT speaker_label, text FROM public.transcript_segments
        WHERE meeting_id = '${meetingA_Id}' AND id = '${segmentA_Id}';
      `);
      expect(updatedSegs.rows[0].speaker_label).toBe('Dr. Carlos Mendes (CEO)');

      // Verify updated participant
      const updatedPart = await db.query<{ name: string; speaker_label: string }>(`
        SELECT name, speaker_label FROM public.meeting_participants
        WHERE meeting_id = '${meetingA_Id}' AND speaker_label = 'Dr. Carlos Mendes (CEO)';
      `);
      expect(updatedPart.rows.length).toBe(1);
      expect(updatedPart.rows[0].name).toBe('Dr. Carlos Mendes');

      // 2. Perform inline edit on segment
      await db.query(`
        UPDATE public.transcript_segments
        SET text = 'Dados estratégicos devidamente corrigidos.',
            is_edited = true,
            original_text = 'Dados estratégicos Confidenciais Org A'
        WHERE id = '${segmentA_Id}';
      `);

      const editedSeg = await db.query<{ text: string; is_edited: boolean; original_text: string }>(`
        SELECT text, is_edited, original_text FROM public.transcript_segments
        WHERE id = '${segmentA_Id}';
      `);
      expect(editedSeg.rows[0].text).toBe('Dados estratégicos devidamente corrigidos.');
      expect(editedSeg.rows[0].is_edited).toBe(true);
      expect(editedSeg.rows[0].original_text).toBe('Dados estratégicos Confidenciais Org A');

      // 3. Update meeting human review status
      await db.query(`
        UPDATE public.meetings
        SET transcription_review_status = 'validated',
            reviewed_by = '${userA_Id}',
            reviewed_at = NOW()
        WHERE id = '${meetingA_Id}';
      `);

      const reviewedMeet = await db.query<{ transcription_review_status: string }>(`
        SELECT transcription_review_status FROM public.meetings WHERE id = '${meetingA_Id}';
      `);
      expect(reviewedMeet.rows[0].transcription_review_status).toBe('validated');
    });
  });
});
