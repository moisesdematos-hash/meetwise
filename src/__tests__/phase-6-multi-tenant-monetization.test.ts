import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('MEETWISE AI — Phase 6 PostgreSQL Real Multi-Tenant Monetization & Security Audit', () => {
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

    // 2. Apply all 7 migrations in sequence
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
      '20261104000005_phase_4_intelligence.sql',
      '20261104000006_phase_5_export_and_collaboration.sql',
      '20261105000007_phase_6_monetization_and_admin.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  it('verifies that Phase 6 migration creates all required tables, constraints, and atomic functions', async () => {
    // 1. Verify plan_prices table
    const pricesTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'plan_prices';
    `);
    expect(pricesTable.rows).toHaveLength(1);

    // 2. Verify checkout_sessions table
    const checkoutTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'checkout_sessions';
    `);
    expect(checkoutTable.rows).toHaveLength(1);

    // 3. Verify invoices & invoice_lines tables
    const invTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('invoices', 'invoice_lines');
    `);
    expect(invTable.rows).toHaveLength(2);

    // 4. Verify financial_ledger_entries table
    const ledgerTable = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'financial_ledger_entries';
    `);
    expect(ledgerTable.rows).toHaveLength(1);

    // 5. Verify refunds, platform_admins, organization_quota_reserves
    const otherTables = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('refunds', 'platform_admins', 'organization_quota_reserves');
    `);
    expect(otherTables.rows).toHaveLength(3);

    // 6. Verify starter plan exists in plans
    const starterPlan = await db.query(`
      SELECT code, monthly_minutes_included FROM public.plans WHERE code = 'starter';
    `);
    expect(starterPlan.rows).toHaveLength(1);
    expect((starterPlan.rows[0] as Record<string, any>).monthly_minutes_included).toBe(180);

    // 7. Test atomic get_next_invoice_number function
    const orgId = '00000000-0000-0000-0000-000000000099';
    const userId = '99999999-9999-9999-9999-999999999999';
    await db.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('${userId}', 'seq@test.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name, locale)
      VALUES ('${userId}', 'seq@test.com', 'Seq User', 'pt')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organizations (id, name, slug, created_by)
      VALUES ('${orgId}', 'Seq Test Org', 'seq-test-org', '${userId}')
      ON CONFLICT (id) DO NOTHING;
    `);

    const inv1 = await db.query(`SELECT public.get_next_invoice_number('${orgId}'::uuid, 2026) as num;`);
    const inv2 = await db.query(`SELECT public.get_next_invoice_number('${orgId}'::uuid, 2026) as num;`);

    expect((inv1.rows[0] as Record<string, any>).num).toBe('FAT-2026-0001');
    expect((inv2.rows[0] as Record<string, any>).num).toBe('FAT-2026-0002');
  });

  it('enforces strict multi-tenant RLS isolation on invoices and prevents cross-tenant access', async () => {
    // Create User A and User B
    const userA_Id = '11111111-1111-1111-1111-111111111111';
    const userB_Id = '22222222-2222-2222-2222-222222222222';
    const orgA_Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const orgB_Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${userA_Id}', 'usera@orga.com'),
        ('${userB_Id}', 'userb@orgb.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name, locale) VALUES
        ('${userA_Id}', 'usera@orga.com', 'User A', 'pt'),
        ('${userB_Id}', 'userb@orgb.com', 'User B', 'pt')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
        ('${orgA_Id}', 'Empresa A', 'empresa-a', '${userA_Id}'),
        ('${orgB_Id}', 'Empresa B', 'empresa-b', '${userB_Id}')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
        ('${orgA_Id}', '${userA_Id}', 'owner', 'active'),
        ('${orgB_Id}', '${userB_Id}', 'owner', 'active')
      ON CONFLICT (organization_id, user_id) DO NOTHING;

      -- Seed an invoice for Org A
      INSERT INTO public.invoices (id, organization_id, invoice_number, currency, subtotal_cents, total_cents, status, due_date)
      VALUES (
        'aaaaaaaa-1111-0000-0000-000000000001',
        '${orgA_Id}',
        'FAT-2026-0001',
        'EUR',
        1800,
        1800,
        'paid',
        NOW() + INTERVAL '14 days'
      ) ON CONFLICT (id) DO NOTHING;

      -- Seed an invoice for Org B
      INSERT INTO public.invoices (id, organization_id, invoice_number, currency, subtotal_cents, total_cents, status, due_date)
      VALUES (
        'bbbbbbbb-2222-0000-0000-000000000002',
        '${orgB_Id}',
        'FAT-2026-0002',
        'AOA',
        6800000,
        6800000,
        'issued',
        NOW() + INTERVAL '14 days'
      ) ON CONFLICT (id) DO NOTHING;
    `);

    // 1. As User A: can view only Org A's invoice
    await asUser(userA_Id, async () => {
      const result = await db.query(`SELECT invoice_number, total_cents, currency FROM public.invoices;`);
      expect(result.rows).toHaveLength(1);
      const rowA = result.rows[0] as Record<string, any>;
      expect(rowA.invoice_number).toBe('FAT-2026-0001');
      expect(rowA.currency).toBe('EUR');
    });

    // 2. As User B: can view only Org B's invoice
    await asUser(userB_Id, async () => {
      const result = await db.query(`SELECT invoice_number, total_cents, currency FROM public.invoices;`);
      expect(result.rows).toHaveLength(1);
      const rowB = result.rows[0] as Record<string, any>;
      expect(rowB.invoice_number).toBe('FAT-2026-0002');
      expect(rowB.currency).toBe('AOA');
    });
  });

  it('triggers anti-tamper trigger when trying to reassign invoice organization_id', async () => {
    const orgA_Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const orgB_Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Attempt to tamper organization_id
    await expect(
      db.query(`
        UPDATE public.invoices
        SET organization_id = '${orgB_Id}'
        WHERE organization_id = '${orgA_Id}';
      `)
    ).rejects.toThrow();
  });

  it('strictly forbids UPDATE or DELETE on financial_ledger_entries via trigger', async () => {
    const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const txId = '11111111-2222-3333-4444-555555555555';

    // Insert valid entry
    await db.exec(`
      INSERT INTO public.financial_ledger_entries (
        id, transaction_id, organization_id, account_type, entry_type,
        amount_cents, currency, reference_type, reference_id, description
      ) VALUES (
        '99999999-0000-0000-0000-000000000001',
        '${txId}',
        '${orgId}',
        'revenue',
        'credit',
        4900,
        'USD',
        'invoice',
        'inv-audit-test',
        'Subscription initial credit'
      );
    `);

    // Verify UPDATE fails with trigger exception
    await expect(
      db.query(`
        UPDATE public.financial_ledger_entries
        SET amount_cents = 9999
        WHERE id = '99999999-0000-0000-0000-000000000001';
      `)
    ).rejects.toThrow(/Modifications or deletions to financial ledger entries are forbidden/);

    // Verify DELETE fails with trigger exception
    await expect(
      db.query(`
        DELETE FROM public.financial_ledger_entries
        WHERE id = '99999999-0000-0000-0000-000000000001';
      `)
    ).rejects.toThrow(/Modifications or deletions to financial ledger entries are forbidden/);
  });

  it('strictly forbids DELETE on payment_events via trigger', async () => {
    const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    // Insert valid payment event
    await db.exec(`
      INSERT INTO public.payment_events (
        id, organization_id, provider, external_event_id, event_type,
        amount_cents, currency, status, payload
      ) VALUES (
        '88888888-0000-0000-0000-000000000001',
        '${orgId}',
        'stripe',
        'evt_test_audit_123',
        'payment_intent.succeeded',
        4900,
        'USD',
        'processed',
        '{"test": true}'::jsonb
      );
    `);

    // Verify DELETE fails
    await expect(
      db.query(`
        DELETE FROM public.payment_events
        WHERE id = '88888888-0000-0000-0000-000000000001';
      `)
    ).rejects.toThrow(/Deletions of payment events are forbidden/);
  });
});
