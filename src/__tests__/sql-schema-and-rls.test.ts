import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Database Schema & Migration Validation', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  it('should find all 3 versioned migration files in order', () => {
    const files = fs.readdirSync(migrationsDir).sort();
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files).toContain('20261104000001_initial_schema.sql');
    expect(files).toContain('20261104000002_rls_policies.sql');
    expect(files).toContain('20261104000003_storage_and_indexes.sql');
  });

  it('should create all 20 foundational tables in initial_schema.sql', () => {
    const schemaSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000001_initial_schema.sql'),
      'utf-8'
    );

    const expectedTables = [
      'profiles',
      'organizations',
      'organization_members',
      'organization_invitations',
      'meetings',
      'meeting_participants',
      'media_assets',
      'processing_jobs',
      'transcript_segments',
      'meeting_summaries',
      'meeting_minutes',
      'meeting_decisions',
      'meeting_tasks',
      'meeting_documents',
      'plans',
      'subscriptions',
      'usage_ledger',
      'payment_events',
      'ai_provider_requests',
      'audit_logs',
    ];

    for (const table of expectedTables) {
      const regex = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(`, 'i');
      expect(schemaSql).toMatch(regex);
    }
  });

  it('should enable Row Level Security on all 20 tables in rls_policies.sql', () => {
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000002_rls_policies.sql'),
      'utf-8'
    );

    const expectedTables = [
      'profiles',
      'organizations',
      'organization_members',
      'organization_invitations',
      'meetings',
      'meeting_participants',
      'media_assets',
      'processing_jobs',
      'transcript_segments',
      'meeting_summaries',
      'meeting_minutes',
      'meeting_decisions',
      'meeting_tasks',
      'meeting_documents',
      'plans',
      'subscriptions',
      'usage_ledger',
      'payment_events',
      'ai_provider_requests',
      'audit_logs',
    ];

    for (const table of expectedTables) {
      const regex = new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`, 'i');
      expect(rlsSql).toMatch(regex);
    }
  });

  it('should define SECURITY DEFINER with fixed search_path for authorization helpers', () => {
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000002_rls_policies.sql'),
      'utf-8'
    );

    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION public.current_user_org_ids()');
    expect(rlsSql).toContain('SECURITY DEFINER');
    expect(rlsSql).toContain('SET search_path = public, auth, pg_temp');
  });

  it('should attach prevent_org_id_tamper triggers to protect tenant isolation', () => {
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000002_rls_policies.sql'),
      'utf-8'
    );

    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION public.prevent_org_id_tamper()');
    expect(rlsSql).toContain('trg_tamper_meetings');
    expect(rlsSql).toContain('trg_tamper_segments');
    expect(rlsSql).toContain('trg_tamper_ledger');
  });

  it('should enforce last owner protection in protect_last_owner trigger', () => {
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000002_rls_policies.sql'),
      'utf-8'
    );

    expect(rlsSql).toContain('CREATE OR REPLACE FUNCTION public.protect_last_owner()');
    expect(rlsSql).toContain('Cannot remove or demote the last remaining active owner');
  });

  it('should configure storage buckets and folder isolation in storage_and_indexes.sql', () => {
    const storageSql = fs.readFileSync(
      path.join(migrationsDir, '20261104000003_storage_and_indexes.sql'),
      'utf-8'
    );

    expect(storageSql).toContain("'meeting_recordings'");
    expect(storageSql).toContain("'meeting_documents'");
    expect(storageSql).toContain('storage_select_org_member');
    expect(storageSql).toContain('storage_insert_org_member');
    expect(storageSql).toContain('storage_delete_org_admin');
  });
});
