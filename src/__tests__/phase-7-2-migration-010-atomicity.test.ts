import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.1
 * Concurrency Safety & Quota Atomicity — Migration 010 Local Test Suite
 *
 * Validates:
 * - CRIT-RC-01: Serialized last owner protection via organization FOR UPDATE lock
 * - CRIT-RC-02: PostgreSQL atomic quota reservation, release, and settlement RPCs
 * - Idempotency, limit enforcement, subscription status checks, and RLS tenant boundaries
 */
describe('MEETWISE AI — Phase 7.2 Migration 010 Concurrency & Quota Atomicity Suite', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Synthetic Test Identifiers
  const orgAlphaId = '3f737a15-0000-4000-a000-000000000001';
  const orgBetaId = '0203a089-0000-4000-b000-000000000002';
  const alphaOwner1Id = 'bf83fb78-0000-4000-a000-000000000001';
  const alphaOwner2Id = 'bf83fb78-0000-4000-a000-000000000002';
  const alphaMemberId = 'ebf825cf-0000-4000-a000-000000000003';
  const betaOwnerId = 'ff1f55ea-0000-4000-b000-000000000001';
  const externalUserId = '1e1cf195-0000-4000-c000-000000000001';

  let freePlanId: string;
  let proPlanId: string;

  // Helper to execute in context of an authenticated user
  async function asUser<T>(userId: string | null, callback: () => Promise<T>, role: string = 'authenticated'): Promise<T> {
    if (userId) {
      await db.query(`SET ROLE ${role};`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '${role}', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '{"sub": "${userId}", "role": "${role}"}', false);`);
    } else {
      await db.query(`SET ROLE anon;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', 'anon', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '{"role": "anon"}', false);`);
    }
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '', false);`);
    }
  }

  // Helper to execute in context of service_role
  async function asServiceRole<T>(callback: () => Promise<T>): Promise<T> {
    await db.query(`SET ROLE service_role;`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    await db.query(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
    await db.query(`SELECT set_config('request.jwt.claims', '{"role": "service_role"}', false);`);
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '', false);`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Supabase Mock Environment
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;

      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
                THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
                ELSE NULL END),
          current_user
        );
      $$ LANGUAGE sql STABLE;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        ELSE
          ALTER ROLE service_role BYPASSRLS;
        END IF;
      END $$;

      GRANT USAGE ON SCHEMA auth TO service_role, authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role, authenticated, anon;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO service_role, authenticated, anon;
    `);

    // 2. Apply Migrations 001 to 010 in Sequence
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
      '20261104000005_phase_4_intelligence.sql',
      '20261104000006_phase_5_export_and_collaboration.sql',
      '20261105000007_phase_6_monetization_and_admin.sql',
      '20261106000008_profiles_insert_and_onboarding_fix.sql',
      '20261106000009_financial_integrity_and_audit_security.sql',
      '20261106000010_concurrency_and_quota_atomicity.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // 3. Seed Synthetic Identities
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${alphaOwner1Id}', 'alpha_owner_1@meetwise.ai'),
        ('${alphaOwner2Id}', 'alpha_owner_2@meetwise.ai'),
        ('${alphaMemberId}', 'alpha_member@meetwise.ai'),
        ('${betaOwnerId}', 'beta_owner@meetwise.ai'),
        ('${externalUserId}', 'external_user@meetwise.ai')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name) VALUES
        ('${alphaOwner1Id}', 'alpha_owner_1@meetwise.ai', 'Alpha Owner 1'),
        ('${alphaOwner2Id}', 'alpha_owner_2@meetwise.ai', 'Alpha Owner 2'),
        ('${alphaMemberId}', 'alpha_member@meetwise.ai', 'Alpha Member'),
        ('${betaOwnerId}', 'beta_owner@meetwise.ai', 'Beta Owner'),
        ('${externalUserId}', 'external_user@meetwise.ai', 'External User')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
        ('${orgAlphaId}', 'Organization Alpha Synthetic', 'org-alpha-synth-010', '${alphaOwner1Id}'),
        ('${orgBetaId}', 'Organization Beta Synthetic', 'org-beta-synth-010', '${betaOwnerId}')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
        ('${orgAlphaId}', '${alphaOwner1Id}', 'owner', 'active'),
        ('${orgAlphaId}', '${alphaOwner2Id}', 'owner', 'active'),
        ('${orgAlphaId}', '${alphaMemberId}', 'member', 'active'),
        ('${orgBetaId}', '${betaOwnerId}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    // Retrieve plan IDs
    const plansRes = await db.query<{ id: string; code: string }>(`SELECT id, code FROM public.plans;`);
    freePlanId = plansRes.rows.find((p) => p.code === 'free')!.id;
    proPlanId = plansRes.rows.find((p) => p.code === 'pro')!.id;

    // Attach Free Plan to Org Alpha (limit: 60 minutes)
    await db.exec(`
      INSERT INTO public.subscriptions (
        organization_id, plan_id, status, current_period_start, current_period_end, currency, provider
      ) VALUES (
        '${orgAlphaId}', '${freePlanId}', 'active', NOW(), NOW() + INTERVAL '30 days', 'USD', 'mock'
      ) ON CONFLICT (organization_id) DO UPDATE SET
        plan_id = '${freePlanId}',
        status = 'active',
        current_period_end = NOW() + INTERVAL '30 days';
    `);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  // ============================================================================
  // GROUP 1: CRIT-RC-01 — PROTECT LAST OWNER
  // ============================================================================
  describe('CRIT-RC-01: Serialized Last Owner Protection', () => {
    it('[RC-01] Allows demoting an owner when another active owner exists', async () => {
      // Org Alpha currently has alphaOwner1Id and alphaOwner2Id
      await asUser(alphaOwner1Id, async () => {
        const res = await db.query<{ role: string }>(`
          UPDATE public.organization_members
          SET role = 'member'
          WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaOwner2Id}'
          RETURNING role;
        `);
        expect(res.rows[0].role).toBe('member');
      });

      // Verify alphaOwner1Id is now the sole active owner
      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.organization_members
        WHERE organization_id = '${orgAlphaId}' AND role = 'owner' AND status = 'active';
      `);
      expect(Number(countRes.rows[0].count)).toBe(1);
    });

    it('[RC-02] Strictly blocks demoting the last remaining active owner', async () => {
      // alphaOwner1Id is now the only active owner
      await asUser(alphaOwner1Id, async () => {
        await expect(
          db.query(`
            UPDATE public.organization_members
            SET role = 'member'
            WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaOwner1Id}';
          `)
        ).rejects.toThrow(/Cannot remove or demote the last remaining active owner/);
      });

      // Confirm owner count remains 1
      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.organization_members
        WHERE organization_id = '${orgAlphaId}' AND role = 'owner' AND status = 'active';
      `);
      expect(Number(countRes.rows[0].count)).toBe(1);
    });

    it('[RC-03] Strictly blocks deleting the last remaining active owner', async () => {
      await asUser(alphaOwner1Id, async () => {
        await expect(
          db.query(`
            DELETE FROM public.organization_members
            WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaOwner1Id}';
          `)
        ).rejects.toThrow(/Cannot remove or demote the last remaining active owner/);
      });
    });

    it('[RC-04] Strictly blocks suspending or deactivating the last active owner', async () => {
      await asUser(alphaOwner1Id, async () => {
        await expect(
          db.query(`
            UPDATE public.organization_members
            SET status = 'suspended'
            WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaOwner1Id}';
          `)
        ).rejects.toThrow(/Cannot remove or demote the last remaining active owner/);
      });
    });

    it('[RC-05] Re-promoting owner restores dual-owner status safely', async () => {
      await asUser(alphaOwner1Id, async () => {
        await db.query(`
          UPDATE public.organization_members
          SET role = 'owner', status = 'active'
          WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaOwner2Id}';
        `);
      });

      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.organization_members
        WHERE organization_id = '${orgAlphaId}' AND role = 'owner' AND status = 'active';
      `);
      expect(Number(countRes.rows[0].count)).toBe(2);
    });
  });

  // ============================================================================
  // GROUP 2: CRIT-RC-02 — ATOMIC QUOTA RESERVATION RPC
  // ============================================================================
  describe('CRIT-RC-02: Atomic Quota Reservation RPC', () => {
    it('[QA-01] Blocks unauthorized external user from reserving quota', async () => {
      await asUser(externalUserId, async () => {
        await expect(
          db.query(`
            SELECT * FROM public.reserve_organization_quota(
              '${orgAlphaId}', 10, 'key_unauth_01'
            );
          `)
        ).rejects.toThrow(/User is not an active member of this organization/);
      });
    });

    it('[QA-02] Successfully reserves quota for an active member within plan limit', async () => {
      // Free plan limit is 45 minutes
      let result: any;
      await asUser(alphaMemberId, async () => {
        const res = await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}', 25, 'key_alpha_res_01'
          );
        `);
        result = res.rows[0];
      });

      expect(result.reserved).toBe(true);
      expect(result.reservation_id).toBeDefined();
      expect(Number(result.remaining_minutes)).toBe(20); // 45 - 25 = 20
    });

    it('[QA-03] Returns existing reservation idempotently when key is repeated', async () => {
      let result: any;
      await asUser(alphaMemberId, async () => {
        const res = await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}', 25, 'key_alpha_res_01'
          );
        `);
        result = res.rows[0];
      });

      expect(result.reserved).toBe(true);
      expect(Number(result.remaining_minutes)).toBe(20);

      // Verify only 1 reservation row exists
      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.organization_quota_reserves
        WHERE idempotency_key = 'key_alpha_res_01';
      `);
      expect(Number(countRes.rows[0].count)).toBe(1);
    });

    it('[QA-04] Allows second reservation within remaining balance', async () => {
      // Currently: 25 reserved, remaining: 20. Requesting 15.
      let result: any;
      await asUser(alphaOwner1Id, async () => {
        const res = await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}', 15, 'key_alpha_res_02'
          );
        `);
        result = res.rows[0];
      });

      expect(result.reserved).toBe(true);
      expect(Number(result.remaining_minutes)).toBe(5); // 20 - 15 = 5
    });

    it('[QA-05] Rejects reservation when requested minutes exceed remaining balance', async () => {
      // Currently: 40 reserved (25 + 15), remaining: 5. Requesting 10.
      await asUser(alphaMemberId, async () => {
        await expect(
          db.query(`
            SELECT * FROM public.reserve_organization_quota(
              '${orgAlphaId}', 10, 'key_alpha_res_exceed'
            );
          `)
        ).rejects.toThrow(/Quota Exceeded/);
      });
    });

    it('[QA-06] Rejects reservation if subscription is suspended', async () => {
      // Temporarily mark subscription as suspended
      await asServiceRole(async () => {
        await db.query(`
          UPDATE public.subscriptions
          SET status = 'suspended'
          WHERE organization_id = '${orgAlphaId}';
        `);
      });

      await asUser(alphaOwner1Id, async () => {
        await expect(
          db.query(`
            SELECT * FROM public.reserve_organization_quota(
              '${orgAlphaId}', 2, 'key_sub_suspended'
            );
          `)
        ).rejects.toThrow(/Subscription Inactive/);
      });

      // Restore active subscription
      await asServiceRole(async () => {
        await db.query(`
          UPDATE public.subscriptions
          SET status = 'active'
          WHERE organization_id = '${orgAlphaId}';
        `);
      });
    });
  });

  // ============================================================================
  // GROUP 3: RELEASE & SETTLE ATOMICS
  // ============================================================================
  describe('Release and Settle RPCs', () => {
    it('[QA-07] Releases an active reservation and restores remaining balance', async () => {
      // Release key_alpha_res_02 (15 minutes)
      await asUser(alphaOwner1Id, async () => {
        const res = await db.query<{ release_organization_quota: boolean }>(`
          SELECT public.release_organization_quota(NULL, 'key_alpha_res_02');
        `);
        expect(res.rows[0].release_organization_quota).toBe(true);
      });

      // Verify reservation status is now 'released'
      const statusRes = await db.query<{ status: string }>(`
        SELECT status FROM public.organization_quota_reserves
        WHERE idempotency_key = 'key_alpha_res_02';
      `);
      expect(statusRes.rows[0].status).toBe('released');

      // Now remaining balance should be 45 - 25 = 20. Reserving 15 should now succeed!
      let result: any;
      await asUser(alphaMemberId, async () => {
        const res = await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}', 15, 'key_alpha_res_after_release'
          );
        `);
        result = res.rows[0];
      });
      expect(result.reserved).toBe(true);
      expect(Number(result.remaining_minutes)).toBe(5); // 20 - 15 = 5
    });

    it('[QA-08] Settles an active reservation into usage_ledger', async () => {
      let result: any;
      await asUser(alphaOwner1Id, async () => {
        const res = await db.query(`
          SELECT * FROM public.settle_organization_quota(
            NULL, 22.5, NULL, 'key_alpha_res_01'
          );
        `);
        result = res.rows[0];
      });

      expect(result.settled).toBe(true);
      expect(Number(result.settled_minutes)).toBe(22.5);
      expect(result.ledger_id).toBeDefined();

      // Check reservation status changed to 'settled'
      const statusRes = await db.query<{ status: string }>(`
        SELECT status FROM public.organization_quota_reserves
        WHERE idempotency_key = 'key_alpha_res_01';
      `);
      expect(statusRes.rows[0].status).toBe('settled');

      // Check usage_ledger record
      const ledgerRes = await db.query<{ quantity: string; status: string }>(`
        SELECT quantity, status FROM public.usage_ledger
        WHERE idempotency_key = 'settle_key_alpha_res_01';
      `);
      expect(Number(ledgerRes.rows[0].quantity)).toBe(22.5);
      expect(ledgerRes.rows[0].status).toBe('settled');
    });

    it('[QA-09] Prevents re-reserving with already settled key', async () => {
      await asUser(alphaMemberId, async () => {
        await expect(
          db.query(`
            SELECT * FROM public.reserve_organization_quota(
              '${orgAlphaId}', 10, 'key_alpha_res_01'
            );
          `)
        ).rejects.toThrow(/Idempotency Conflict/);
      });
    });
  });

  // ============================================================================
  // GROUP 4: SCHEMA MIGRATIONS IDEMPOTENCY
  // ============================================================================
  describe('Migration 010 Catalog Registration', () => {
    it('[MIG-010] Confirms 20261106000010 registered in schema_migrations', async () => {
      const res = await db.query<{ version: string }>(`
        SELECT version FROM supabase_migrations.schema_migrations
        WHERE version = '20261106000010';
      `);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].version).toBe('20261106000010');
    });
  });
});
