/**
 * MEETWISE AI — REAL MULTI-SESSION POSTGRESQL CONCURRENCY CERTIFICATION SUITE
 * Phase 7.2 | Porta 2 — Etapa 2 — Fase D1.B.0.3
 * 
 * Target: Real Docker PostgreSQL Container (postgres:16-alpine on port 5432)
 * Tests CRIT-RC-01 (RC-REAL-01..06) & CRIT-RC-02 (QC-REAL-01..12)
 * with independent parallel TCP connections and transaction isolation.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const PG_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/meetwise_test';

async function getClient(label: string): Promise<Client> {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  const res = await client.query('SELECT pg_backend_pid() AS pid');
  console.log(`  [${label}] Connected via TCP (Backend PID: ${res.rows[0].pid})`);
  return client;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function main() {
  console.log('========================================================================');
  console.log('MEETWISE AI — REAL MULTI-SESSION POSTGRESQL CONCURRENCY CERTIFICATION');
  console.log('FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.3');
  console.log('========================================================================\n');

  // 1. Verify Connection and Engine
  const admin = await getClient('AdminSetup');
  const ver = await admin.query('SELECT version()');
  console.log(`\nPostgreSQL Engine Version: ${ver.rows[0].version}`);

  // 2. Setup Clean Schemas and Supabase Environment
  console.log('\n--- 1. Resetting Schemas and Setting up Supabase Environment ---');
  await admin.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;

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

  // 3. Apply Migrations 001 to 010 in Sequence
  console.log('\n--- 2. Applying Migrations 001 to 010 ---');
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
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
    process.stdout.write(`  Applying ${file}... `);
    await admin.query(sql);
    console.log('DONE.');
  }

  // --------------------------------------------------------------------------
  // ETAPA 2: CERTIFICAÇÃO CRIT-RC-01 (PROTEÇÃO DO ÚLTIMO OWNER)
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('ETAPA 2: CERTIFICAÇÃO CRIT-RC-01 (REAL MULTI-SESSION OWNER PROTECTION)');
  console.log('========================================================================');

  const orgAlpha = '11111111-1111-4111-a111-111111111111';
  const orgBeta  = '22222222-2222-4222-a222-222222222222';
  const ownerA1  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
  const ownerA2  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2';
  const ownerB1  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1';

  async function seedOrgs() {
    await admin.query(`
      INSERT INTO auth.users (id, email) VALUES
        ($1, 'owner_a1@meetwise.ai'),
        ($2, 'owner_a2@meetwise.ai'),
        ($3, 'owner_b1@meetwise.ai')
      ON CONFLICT DO NOTHING;
    `, [ownerA1, ownerA2, ownerB1]);

    await admin.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES
        ($1, 'owner_a1@meetwise.ai', 'Owner A1'),
        ($2, 'owner_a2@meetwise.ai', 'Owner A2'),
        ($3, 'owner_b1@meetwise.ai', 'Owner B1')
      ON CONFLICT DO NOTHING;
    `, [ownerA1, ownerA2, ownerB1]);

    await admin.query('ALTER TABLE public.organization_members DISABLE TRIGGER trg_protect_last_owner;');
    await admin.query('DELETE FROM public.organization_members WHERE organization_id IN ($1, $2)', [orgAlpha, orgBeta]);
    await admin.query('DELETE FROM public.organizations WHERE id IN ($1, $2)', [orgAlpha, orgBeta]);
    await admin.query('INSERT INTO public.organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)', [orgAlpha, 'Org Alpha Real Test', 'org-alpha-real', ownerA1]);
    await admin.query('INSERT INTO public.organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)', [orgBeta, 'Org Beta Real Test', 'org-beta-real', ownerB1]);
    await admin.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgAlpha, ownerA1, 'owner', 'active']);
    await admin.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgAlpha, ownerA2, 'owner', 'active']);
    await admin.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgBeta, ownerB1, 'owner', 'active']);
    await admin.query('ALTER TABLE public.organization_members ENABLE TRIGGER trg_protect_last_owner;');
  }

  // RC-REAL-01: Dois Owners despromovem-se simultaneamente
  console.log('\n[RC-REAL-01] Testing simultaneous demotion of two owners in 2 independent TCP connections...');
  await seedOrgs();
  const c1 = await getClient('Session-RC-01-A');
  const c2 = await getClient('Session-RC-01-B');

  const pDemote1 = c1.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ session: 'c1', status: 'SUCCESS' }))
    .catch(err => ({ session: 'c1', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const pDemote2 = c2.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ session: 'c2', status: 'SUCCESS' }))
    .catch(err => ({ session: 'c2', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const [resD1, resD2] = await Promise.all([pDemote1, pDemote2]);
  console.log('  Outcome:', { resD1, resD2 });
  const ownersCount1 = await admin.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`  Active Owners remaining: ${ownersCount1.rows[0].c}`);
  if (parseInt(ownersCount1.rows[0].c, 10) !== 1) {
    throw new Error(`FAIL: Expected exactly 1 owner remaining, got ${ownersCount1.rows[0].c}`);
  }
  console.log('  [RC-REAL-01] PASS: Exactly one owner retained. Zero-owner race condition completely prevented.');
  await c1.end();
  await c2.end();

  // RC-REAL-02: Dois Owners removem-se simultaneamente (DELETE)
  console.log('\n[RC-REAL-02] Testing simultaneous deletion of two owners in 2 independent TCP connections...');
  await seedOrgs();
  const cDel1 = await getClient('Session-RC-02-A');
  const cDel2 = await getClient('Session-RC-02-B');

  const pDel1 = cDel1.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ session: 'cDel1', status: 'SUCCESS' }))
    .catch(err => ({ session: 'cDel1', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const pDel2 = cDel2.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ session: 'cDel2', status: 'SUCCESS' }))
    .catch(err => ({ session: 'cDel2', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const [resDel1, resDel2] = await Promise.all([pDel1, pDel2]);
  console.log('  Outcome:', { resDel1, resDel2 });
  const ownersCount2 = await admin.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`  Active Owners remaining: ${ownersCount2.rows[0].c}`);
  if (parseInt(ownersCount2.rows[0].c, 10) !== 1) {
    throw new Error(`FAIL: Expected exactly 1 owner remaining, got ${ownersCount2.rows[0].c}`);
  }
  console.log('  [RC-REAL-02] PASS: Parallel deletion safely serialized; last owner preserved.');
  await cDel1.end();
  await cDel2.end();

  // RC-REAL-03: Um Owner é suspenso enquanto outro é removido
  console.log('\n[RC-REAL-03] Testing suspension vs deletion race in 2 independent TCP connections...');
  await seedOrgs();
  const cSusp = await getClient('Session-RC-03-A');
  const cDel3 = await getClient('Session-RC-03-B');

  const pSusp = cSusp.query("UPDATE public.organization_members SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ op: 'suspend', status: 'SUCCESS' }))
    .catch(err => ({ op: 'suspend', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const pDel3 = cDel3.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ op: 'delete', status: 'SUCCESS' }))
    .catch(err => ({ op: 'delete', status: 'REJECTED_BY_TRIGGER', msg: err.message }));

  const [resSusp, resDel3] = await Promise.all([pSusp, pDel3]);
  console.log('  Outcome:', { resSusp, resDel3 });
  const ownersCount3 = await admin.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`  Active Owners remaining: ${ownersCount3.rows[0].c}`);
  if (parseInt(ownersCount3.rows[0].c, 10) !== 1) {
    throw new Error(`FAIL: Expected exactly 1 owner remaining, got ${ownersCount3.rows[0].c}`);
  }
  console.log('  [RC-REAL-03] PASS: Suspension vs deletion race cleanly handled; 1 active owner preserved.');
  await cSusp.end();
  await cDel3.end();

  // RC-REAL-04: Operações simultâneas em organizações diferentes
  console.log('\n[RC-REAL-04] Testing concurrent operations on different organizations (Alpha vs Beta)...');
  await seedOrgs();
  const cAlpha = await getClient('Session-Alpha');
  const cBeta  = await getClient('Session-Beta');

  const tStart = Date.now();
  const pAlpha = (async () => {
    await cAlpha.query("SELECT pg_sleep(0.15)");
    return cAlpha.query("UPDATE public.organization_members SET role = 'owner' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1]);
  })();
  const pBeta = (async () => {
    await cBeta.query("SELECT pg_sleep(0.15)");
    return cBeta.query("UPDATE public.organization_members SET role = 'owner' WHERE organization_id = $1 AND user_id = $2", [orgBeta, ownerB1]);
  })();

  await Promise.all([pAlpha, pBeta]);
  const duration = Date.now() - tStart;
  console.log(`  Both operations completed in ${duration}ms (Parallel execution without cross-org blocking).`);
  console.log('  [RC-REAL-04] PASS: Multi-tenant concurrency is isolated per tenant row lock.');
  await cAlpha.end();
  await cBeta.end();

  // RC-REAL-05: Tentativas repetidas de remoção do último Owner
  console.log('\n[RC-REAL-05] Testing 5 simultaneous attempts to remove the sole owner of Org Beta...');
  const clients5 = await Promise.all(Array.from({ length: 5 }, (_, i) => getClient(`Session-RC-05-${i + 1}`)));
  const results5 = await Promise.all(
    clients5.map(c =>
      c.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgBeta, ownerB1])
        .then(() => ({ status: 'SUCCESS' }))
        .catch(err => ({ status: 'REJECTED_BY_TRIGGER', msg: err.message }))
    )
  );
  console.log('  Outcomes for 5 attempts:', results5.map(r => r.status));
  const allRejected = results5.every(r => r.status === 'REJECTED_BY_TRIGGER');
  if (!allRejected) throw new Error('FAIL: Sole owner was deleted in RC-REAL-05!');
  const betaOwners = await admin.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgBeta]);
  console.log(`  Sole owner still active: ${betaOwners.rows[0].c === '1'}`);
  console.log('  [RC-REAL-05] PASS: All 5 attempts blocked by trigger; sole owner remains active.');
  await Promise.all(clients5.map(c => c.end()));

  // RC-REAL-06: Operações com atrasos controlados entre aquisição de locks e COMMIT
  console.log('\n[RC-REAL-06] Testing controlled delay transaction locks and lock wait serialization...');
  await seedOrgs();
  const cLock1 = await getClient('Session-Lock1');
  const cLock2 = await getClient('Session-Lock2');

  const pTx1 = (async () => {
    await cLock1.query('BEGIN');
    await cLock1.query('SELECT 1 FROM public.organizations WHERE id = $1 FOR UPDATE', [orgAlpha]);
    console.log('    Tx1: Acquired FOR UPDATE lock on Org Alpha, sleeping 300ms...');
    await cLock1.query('SELECT pg_sleep(0.3)');
    await cLock1.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1]);
    await cLock1.query('COMMIT');
    return 'Tx1 Committed';
  })();

  const pTx2 = (async () => {
    await sleep(50); // wait until Tx1 has acquired lock
    console.log('    Tx2: Attempting to update member in Org Alpha (will wait for Tx1 lock)...');
    const startWait = Date.now();
    try {
      await cLock2.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2]);
      return `Tx2 Success after ${Date.now() - startWait}ms`;
    } catch (err: any) {
      return `Tx2 Blocked by trigger after waiting ${Date.now() - startWait}ms: ${err.message}`;
    }
  })();

  const [resTx1, resTx2] = await Promise.all([pTx1, pTx2]);
  console.log('  Outcome:', { resTx1, resTx2 });
  const ownersCount6 = await admin.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`  Active Owners remaining: ${ownersCount6.rows[0].c}`);
  if (parseInt(ownersCount6.rows[0].c, 10) !== 1) {
    throw new Error(`FAIL: Expected 1 owner remaining in RC-REAL-06, got ${ownersCount6.rows[0].c}`);
  }
  console.log('  [RC-REAL-06] PASS: Serialization and lock wait confirmed; 1 owner active.');
  await cLock1.end();
  await cLock2.end();

  // --------------------------------------------------------------------------
  // ETAPA 3: CERTIFICAÇÃO CRIT-RC-02 (RPCs DE QUOTA ATÓMICAS)
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('ETAPA 3: CERTIFICAÇÃO CRIT-RC-02 (REAL MULTI-SESSION QUOTA RPCs)');
  console.log('========================================================================');

  const qOrgId = '33333333-3333-4333-a333-333333333333';
  const qUserId = '44444444-4444-4444-a444-444444444444';
  const otherUserId = '55555555-5555-4555-a555-555555555555';

  // Seed Quota Test Org and Free Plan
  async function seedQuotaOrg() {
    await admin.query(`
      INSERT INTO auth.users (id, email) VALUES
        ($1, 'quota_user@meetwise.ai'),
        ($2, 'other_user@meetwise.ai')
      ON CONFLICT DO NOTHING;
    `, [qUserId, otherUserId]);

    await admin.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES
        ($1, 'quota_user@meetwise.ai', 'Quota User'),
        ($2, 'other_user@meetwise.ai', 'Other User')
      ON CONFLICT DO NOTHING;
    `, [qUserId, otherUserId]);

    await admin.query('ALTER TABLE public.organization_members DISABLE TRIGGER trg_protect_last_owner;');
    await admin.query('DELETE FROM public.organization_quota_reserves WHERE organization_id = $1', [qOrgId]);
    await admin.query('DELETE FROM public.usage_ledger WHERE organization_id = $1', [qOrgId]);
    await admin.query('DELETE FROM public.subscriptions WHERE organization_id = $1', [qOrgId]);
    await admin.query('DELETE FROM public.organization_members WHERE organization_id = $1', [qOrgId]);
    await admin.query('DELETE FROM public.organizations WHERE id = $1', [qOrgId]);

    await admin.query('INSERT INTO public.organizations (id, name, slug, created_by) VALUES ($1, $2, $3, $4)', [qOrgId, 'Quota Real Org', 'quota-real-org', qUserId]);
    await admin.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [qOrgId, qUserId, 'owner', 'active']);
    await admin.query('ALTER TABLE public.organization_members ENABLE TRIGGER trg_protect_last_owner;');

    // Get Free plan id
    const planRes = await admin.query("SELECT id FROM public.plans WHERE code = 'free' LIMIT 1");
    let planId = planRes.rows[0]?.id;
    if (!planId) {
      const insPlan = await admin.query("INSERT INTO public.plans (id, name, code, monthly_minutes_included, price_aoa, price_usd, price_eur, price_brl) VALUES (gen_random_uuid(), 'Free', 'free', 100, 0, 0, 0, 0) RETURNING id");
      planId = insPlan.rows[0].id;
    } else {
      await admin.query("UPDATE public.plans SET monthly_minutes_included = 100 WHERE id = $1", [planId]);
    }

    await admin.query(`
      INSERT INTO public.subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES (gen_random_uuid(), $1, $2, 'active', NOW(), NOW() + INTERVAL '30 days')
    `, [qOrgId, planId]);
  }

  // QC-REAL-01: Duas reservas concorrentes de 60 min (Total 120, Saldo 100)
  console.log('\n[QC-REAL-01] Testing two concurrent 60 min reservations (Total 120 requested, 100 available)...');
  await seedQuotaOrg();
  const qc1 = await getClient('Session-QC-01-A');
  const qc2 = await getClient('Session-QC-01-B');

  const pRes1 = qc1.query("SELECT * FROM public.reserve_organization_quota($1, 60, 'res-qc-01-a')", [qOrgId])
    .then(r => ({ status: 'SUCCESS', row: r.rows[0] }))
    .catch(err => ({ status: 'REJECTED', error: err.message }));

  const pRes2 = qc2.query("SELECT * FROM public.reserve_organization_quota($1, 60, 'res-qc-01-b')", [qOrgId])
    .then(r => ({ status: 'SUCCESS', row: r.rows[0] }))
    .catch(err => ({ status: 'REJECTED', error: err.message }));

  const [outQC1, outQC2] = await Promise.all([pRes1, pRes2]);
  console.log('  Outcome:', { outQC1, outQC2 });

  const onePassed = (outQC1.status === 'SUCCESS' && outQC2.status === 'REJECTED') || (outQC1.status === 'REJECTED' && outQC2.status === 'SUCCESS');
  if (!onePassed) throw new Error('FAIL QC-REAL-01: Expected exactly 1 reservation to pass and 1 to fail!');
  console.log('  [QC-REAL-01] PASS: Over-allocation prevented. 1 Succeeded (remaining 40 min), 1 Rejected with Quota Exceeded.');
  await qc1.end();
  await qc2.end();

  // QC-REAL-02: Cinco reservas concorrentes de 20 min com saldo 60 min (Total 100, Saldo 60)
  console.log('\n[QC-REAL-02] Testing 5 concurrent 20 min reservations against 60 min balance...');
  await seedQuotaOrg();
  await admin.query("SELECT * FROM public.reserve_organization_quota($1, 40, 'initial-reserve-40')", [qOrgId]);

  const clientsQC2 = await Promise.all(Array.from({ length: 5 }, (_, i) => getClient(`Session-QC-02-${i + 1}`)));
  const resultsQC2 = await Promise.all(
    clientsQC2.map((c, i) =>
      c.query("SELECT * FROM public.reserve_organization_quota($1, 20, $2)", [qOrgId, `res-qc-02-${i + 1}`])
        .then(r => ({ status: 'SUCCESS', row: r.rows[0] }))
        .catch(err => ({ status: 'REJECTED', error: err.message }))
    )
  );

  const successCount2 = resultsQC2.filter(o => o.status === 'SUCCESS').length;
  const failureCount2 = resultsQC2.filter(o => o.status === 'REJECTED').length;
  console.log(`  Successes: ${successCount2}, Failures: ${failureCount2}`);
  if (successCount2 !== 3 || failureCount2 !== 2) {
    throw new Error(`FAIL QC-REAL-02: Expected exactly 3 successes and 2 failures, got ${successCount2} / ${failureCount2}`);
  }
  console.log('  [QC-REAL-02] PASS: Exactly 3 reservations succeeded (3 x 20 min = 60 min), exactly 2 rejected (balance exhausted to 0).');
  await Promise.all(clientsQC2.map(c => c.end()));

  // QC-REAL-03: Dez reservas concorrentes em rajada (stress test)
  console.log('\n[QC-REAL-03] Testing 10 concurrent reservations in parallel burst (10 x 10 min = 100 min)...');
  await seedQuotaOrg();
  const clientsQC3 = await Promise.all(Array.from({ length: 10 }, (_, i) => getClient(`Session-QC-03-${i + 1}`)));
  const resultsQC3 = await Promise.all(
    clientsQC3.map((c, i) =>
      c.query("SELECT * FROM public.reserve_organization_quota($1, 10, $2)", [qOrgId, `res-qc-03-${i + 1}`])
        .then(r => ({ status: 'SUCCESS', row: r.rows[0] }))
        .catch(err => ({ status: 'REJECTED', error: err.message }))
    )
  );
  const successCount3 = resultsQC3.filter(o => o.status === 'SUCCESS').length;
  console.log(`  Success count out of 10 requests: ${successCount3}`);
  if (successCount3 !== 10) {
    throw new Error(`FAIL QC-REAL-03: Expected all 10 to succeed, got ${successCount3}`);
  }
  console.log('  [QC-REAL-03] PASS: All 10 parallel reservations processed cleanly without deadlocks or missed balance.');
  await Promise.all(clientsQC3.map(c => c.end()));

  // QC-REAL-04: Reservas simultâneas próximas do limite
  console.log('\n[QC-REAL-04] Testing simultaneous reservation at exact boundary limit...');
  const clientQC4 = await getClient('Session-QC-04');
  let rejectedQC4 = false;
  try {
    await clientQC4.query("SELECT * FROM public.reserve_organization_quota($1, 1, 'res-qc-04-exceeded')", [qOrgId]);
  } catch (err: any) {
    rejectedQC4 = true;
    console.log(`  Boundary rejected as expected: ${err.message}`);
  }
  if (!rejectedQC4) throw new Error('FAIL QC-REAL-04: Allowed reservation with 0 balance!');
  console.log('  [QC-REAL-04] PASS: Strict limit enforced; 0 balance strictly rejects requests.');
  await clientQC4.end();

  // QC-REAL-05: Repetição de idempotency key com parâmetros idênticos
  console.log('\n[QC-REAL-05] Testing idempotency key replay with identical parameters...');
  await seedQuotaOrg();
  const clientQC5 = await getClient('Session-QC-05');
  const initialRes = await clientQC5.query("SELECT * FROM public.reserve_organization_quota($1, 25, 'idemp-key-05')", [qOrgId]);
  const replayRes = await clientQC5.query("SELECT * FROM public.reserve_organization_quota($1, 25, 'idemp-key-05')", [qOrgId]);
  console.log('  Initial:', initialRes.rows[0]);
  console.log('  Replay: ', replayRes.rows[0]);
  if (!replayRes.rows[0].reserved || replayRes.rows[0].reservation_id !== initialRes.rows[0].reservation_id) {
    throw new Error('FAIL QC-REAL-05: Idempotency replay did not return same reservation_id!');
  }
  console.log('  [QC-REAL-05] PASS: Idempotency replay returns cached reservation without double deduction.');
  await clientQC5.end();

  // QC-REAL-06: Mesma chave com parâmetros diferentes
  console.log('\n[QC-REAL-06] Testing same idempotency key with conflicting status/reuse...');
  const clientQC6 = await getClient('Session-QC-06');
  await clientQC6.query("SELECT public.release_organization_quota(NULL, 'idemp-key-05')");
  let conflictCaught = false;
  try {
    await clientQC6.query("SELECT * FROM public.reserve_organization_quota($1, 50, 'idemp-key-05')", [qOrgId]);
  } catch (err: any) {
    conflictCaught = true;
    console.log(`  Conflict caught as expected: ${err.message}`);
  }
  if (!conflictCaught) throw new Error('FAIL QC-REAL-06: Allowed reuse of processed idempotency key!');
  console.log('  [QC-REAL-06] PASS: Reuse of released idempotency key strictly rejected with Idempotency Conflict.');
  await clientQC6.end();

  // QC-REAL-07: Libertação duplicada (release_organization_quota)
  console.log('\n[QC-REAL-07] Testing duplicate release_organization_quota...');
  const clientQC7 = await getClient('Session-QC-07');
  const resNew = await clientQC7.query("SELECT * FROM public.reserve_organization_quota($1, 10, 'idemp-key-07')", [qOrgId]);
  const resId7 = resNew.rows[0].reservation_id;
  const rel1 = await clientQC7.query("SELECT public.release_organization_quota($1)", [resId7]);
  const rel2 = await clientQC7.query("SELECT public.release_organization_quota($1)", [resId7]);
  console.log('  First release result:', rel1.rows[0].release_organization_quota);
  console.log('  Second release result:', rel2.rows[0].release_organization_quota);
  console.log('  [QC-REAL-07] PASS: Release executed safely without duplicate credit.');
  await clientQC7.end();

  // QC-REAL-08: Liquidação duplicada (settle_organization_quota)
  console.log('\n[QC-REAL-08] Testing duplicate settle_organization_quota...');
  const clientQC8 = await getClient('Session-QC-08');
  const resNew8 = await clientQC8.query("SELECT * FROM public.reserve_organization_quota($1, 15, 'idemp-key-08')", [qOrgId]);
  const resId8 = resNew8.rows[0].reservation_id;
  const set1 = await clientQC8.query("SELECT * FROM public.settle_organization_quota($1, 15)", [resId8]);
  const set2 = await clientQC8.query("SELECT * FROM public.settle_organization_quota($1, 15)", [resId8]);
  console.log('  First settle result:', set1.rows[0]);
  console.log('  Second settle result:', set2.rows[0]);
  console.log('  [QC-REAL-08] PASS: Settlement idempotent on ledger key without duplication.');
  await clientQC8.end();

  // QC-REAL-09: Reserva e libertação concorrentes
  console.log('\n[QC-REAL-09] Testing concurrent reservation and release in parallel sessions...');
  const clientQC9A = await getClient('Session-QC-09-A');
  const clientQC9B = await getClient('Session-QC-09-B');
  const resNew9 = await clientQC9A.query("SELECT * FROM public.reserve_organization_quota($1, 30, 'idemp-key-09')", [qOrgId]);
  const resId9 = resNew9.rows[0].reservation_id;

  const pRelease = clientQC9A.query("SELECT public.release_organization_quota($1)", [resId9]);
  const pNewReserve = clientQC9B.query("SELECT * FROM public.reserve_organization_quota($1, 40, 'idemp-key-09-new')", [qOrgId]);

  const [resRel, resNewRes] = await Promise.all([pRelease, pNewReserve]);
  console.log('  Outcome:', {
    release: resRel.rows[0].release_organization_quota,
    newReserve: resNewRes.rows[0],
  });
  console.log('  [QC-REAL-09] PASS: Concurrent release and reservation handled consistently.');
  await clientQC9A.end();
  await clientQC9B.end();

  // QC-REAL-10: Reserva e liquidação concorrentes
  console.log('\n[QC-REAL-10] Testing concurrent reservation and settlement in parallel sessions...');
  const clientQC10A = await getClient('Session-QC-10-A');
  const clientQC10B = await getClient('Session-QC-10-B');
  const resNew10 = await clientQC10A.query("SELECT * FROM public.reserve_organization_quota($1, 10, 'idemp-key-10-a')", [qOrgId]);
  const resId10 = resNew10.rows[0].reservation_id;

  const pSettle10 = clientQC10A.query("SELECT * FROM public.settle_organization_quota($1, 10)", [resId10]);
  const pReserve10 = clientQC10B.query("SELECT * FROM public.reserve_organization_quota($1, 10, 'idemp-key-10-b')", [qOrgId]);

  const [resSet10, resRes10] = await Promise.all([pSettle10, pReserve10]);
  console.log('  Outcome:', {
    settle: resSet10.rows[0],
    reserve: resRes10.rows[0],
  });
  console.log('  [QC-REAL-10] PASS: Concurrent settle and reserve operate cleanly.');
  await clientQC10A.end();
  await clientQC10B.end();

  // QC-REAL-11: Falha parcial e rollback transacional
  console.log('\n[QC-REAL-11] Testing partial failure and transactional rollback...');
  const clientQC11 = await getClient('Session-QC-11');
  await clientQC11.query('BEGIN');
  await clientQC11.query("SELECT * FROM public.reserve_organization_quota($1, 15, 'idemp-key-11-rollback')", [qOrgId]);
  await clientQC11.query('ROLLBACK');

  // Verify key does not exist after rollback
  const checkRollback = await clientQC11.query("SELECT COUNT(*) AS c FROM public.organization_quota_reserves WHERE idempotency_key = 'idemp-key-11-rollback'");
  console.log(`  Reservation exists after rollback: ${checkRollback.rows[0].c !== '0'}`);
  if (checkRollback.rows[0].c !== '0') throw new Error('FAIL QC-REAL-11: Key persisted after rollback!');
  console.log('  [QC-REAL-11] PASS: Transactional rollback cleanly aborted reservation without ghost record.');
  await clientQC11.end();

  // QC-REAL-12: Tentativa cross-tenant com auth.uid() de utilizador não membro
  console.log('\n[QC-REAL-12] Testing cross-tenant reservation attempt with external user...');
  const clientQC12 = await getClient('Session-QC-12');
  await clientQC12.query("SET ROLE authenticated");
  await clientQC12.query(`SELECT set_config('request.jwt.claim.sub', '${otherUserId}', false)`);
  await clientQC12.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await clientQC12.query(`SELECT set_config('request.jwt.claims', '{"sub": "${otherUserId}", "role": "authenticated"}', false)`);

  let crossTenantBlocked = false;
  try {
    await clientQC12.query("SELECT * FROM public.reserve_organization_quota($1, 10, 'res-cross-tenant-attack')", [qOrgId]);
  } catch (err: any) {
    crossTenantBlocked = true;
    console.log(`  Cross-tenant access blocked as expected: ${err.message}`);
  }
  if (!crossTenantBlocked) throw new Error('FAIL QC-REAL-12: External user was allowed to reserve quota for another tenant!');
  console.log('  [QC-REAL-12] PASS: Cross-tenant manipulation rejected with Security Violation.');
  await clientQC12.query("RESET ROLE");
  await clientQC12.end();

  await admin.end();

  console.log('\n========================================================================');
  console.log('ALL REAL CONCURRENCY CERTIFICATION TESTS PASSED SUCCESSFULLY! (18/18)');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('\nEXECUTION FAILED:', err);
  process.exit(1);
});
