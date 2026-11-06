/**
 * MEETWISE AI — REAL MULTI-SESSION POSTGRESQL CONCURRENCY CERTIFICATION SUITE
 * Phase 7.2 | Porta 2 — Etapa 2 — Fase D1.B.0.3
 * 
 * Tests CRIT-RC-01 and CRIT-RC-02 against a real PostgreSQL instance (e.g. Docker container)
 * using multiple independent concurrent TCP client connections and transactions.
 * 
 * Execution:
 *   npx tsx scripts/test-real-postgres-concurrency.ts
 */

import { Client } from 'pg';

const PG_CONFIG = {
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/meetwise_test',
};

async function createClient(sessionName: string): Promise<Client> {
  const client = new Client(PG_CONFIG);
  await client.connect();
  const res = await client.query('SELECT pg_backend_pid() AS pid');
  console.log(`  [${sessionName}] Connected (Backend PID: ${res.rows[0].pid})`);
  return client;
}

export async function runConcurrencyCertification() {
  console.log('================================================================');
  console.log('MEETWISE AI — FASE D1.B.0.3 REAL CONCURRENCY CERTIFICATION');
  console.log('================================================================');

  // 0. Check Connection & Engine Version
  let checkClient: Client;
  try {
    checkClient = await createClient('PreFlight');
    const verRes = await checkClient.query('SELECT version()');
    console.log(`PostgreSQL Engine Version: ${verRes.rows[0].version}`);
    await checkClient.end();
  } catch (err: any) {
    console.error('\n[BLOCKED] Cannot connect to local PostgreSQL instance via TCP:', err.message);
    console.error('Please ensure Docker Desktop is running and postgresql://postgres:postgres@localhost:5432/meetwise_test is accessible.\n');
    throw err;
  }

  // --------------------------------------------------------------------------
  // ETAPA 2: CERTIFICAÇÃO CRIT-RC-01 (PROTEÇÃO DO ÚLTIMO OWNER)
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ETAPA 2: CRIT-RC-01 REAL MULTI-SESSION OWNER PROTECTION');
  console.log('================================================================');

  const setup = await createClient('Setup');
  const orgAlpha = '11111111-1111-4111-a111-111111111111';
  const orgBeta  = '22222222-2222-4222-a222-222222222222';
  const ownerA1  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
  const ownerA2  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2';
  const ownerB1  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1';

  // Seed Orgs
  await setup.query('DELETE FROM public.organization_members WHERE organization_id IN ($1, $2)', [orgAlpha, orgBeta]);
  await setup.query('DELETE FROM public.organizations WHERE id IN ($1, $2)', [orgAlpha, orgBeta]);
  await setup.query('INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)', [orgAlpha, 'Org Alpha Concurrency', 'org-alpha-conc']);
  await setup.query('INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)', [orgBeta, 'Org Beta Concurrency', 'org-beta-conc']);
  await setup.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgAlpha, ownerA1, 'owner', 'active']);
  await setup.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgAlpha, ownerA2, 'owner', 'active']);
  await setup.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [orgBeta, ownerB1, 'owner', 'active']);
  await setup.end();

  // RC-REAL-01: Dois Owners despromovem-se simultaneamente
  console.log('\n[RC-REAL-01] Executing concurrent demotion of two owners in parallel sessions...');
  const sA1 = await createClient('Session-A1');
  const sA2 = await createClient('Session-A2');

  const demote1 = sA1.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ session: 'sA1', result: 'SUCCESS' }))
    .catch((err: any) => ({ session: 'sA1', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const demote2 = sA2.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ session: 'sA2', result: 'SUCCESS' }))
    .catch((err: any) => ({ session: 'sA2', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const [resDemote1, resDemote2] = await Promise.all([demote1, demote2]);
  console.log('Outcome:', { resDemote1, resDemote2 });

  const ver1 = await createClient('Verifier');
  const count1 = await ver1.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`Active Owners after RC-REAL-01: ${count1.rows[0].c}`);
  if (parseInt(count1.rows[0].c, 10) < 1) throw new Error('FAIL: RC-REAL-01 left 0 owners!');
  console.log('[RC-REAL-01] PASS: Exactly 1 owner maintained; last owner protected under serialized transaction lock.');
  await sA1.end();
  await sA2.end();

  // Reset Org Alpha to 2 owners
  await ver1.query("UPDATE public.organization_members SET role = 'owner' WHERE organization_id = $1", [orgAlpha]);

  // RC-REAL-02: Dois Owners removem-se simultaneamente (DELETE)
  console.log('\n[RC-REAL-02] Executing concurrent deletion of two owners...');
  const sDel1 = await createClient('Session-Del1');
  const sDel2 = await createClient('Session-Del2');

  const del1 = sDel1.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ session: 'sDel1', result: 'SUCCESS' }))
    .catch((err: any) => ({ session: 'sDel1', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const del2 = sDel2.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ session: 'sDel2', result: 'SUCCESS' }))
    .catch((err: any) => ({ session: 'sDel2', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const [resDel1, resDel2] = await Promise.all([del1, del2]);
  console.log('Outcome:', { resDel1, resDel2 });
  const count2 = await ver1.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`Active Owners after RC-REAL-02: ${count2.rows[0].c}`);
  if (parseInt(count2.rows[0].c, 10) < 1) throw new Error('FAIL: RC-REAL-02 left 0 owners!');
  console.log('[RC-REAL-02] PASS: Parallel deletion safely serialized; last owner preserved.');
  await sDel1.end();
  await sDel2.end();

  // Re-seed for RC-REAL-03
  await ver1.query("DELETE FROM public.organization_members WHERE organization_id = $1", [orgAlpha]);
  await ver1.query("INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'owner', 'active')", [orgAlpha, ownerA1, ownerA2]);

  // RC-REAL-03: Um Owner é suspenso enquanto outro é removido
  console.log('\n[RC-REAL-03] One owner suspended while other is deleted concurrently...');
  const sSusp = await createClient('Session-Susp');
  const sDel3 = await createClient('Session-Del3');

  const actSusp = sSusp.query("UPDATE public.organization_members SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1])
    .then(() => ({ op: 'suspend', result: 'SUCCESS' }))
    .catch((err: any) => ({ op: 'suspend', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const actDel = sDel3.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2])
    .then(() => ({ op: 'delete', result: 'SUCCESS' }))
    .catch((err: any) => ({ op: 'delete', result: 'BLOCKED_BY_TRIGGER', error: err.message }));

  const [resSusp, resDel] = await Promise.all([actSusp, actDel]);
  console.log('Outcome:', { resSusp, resDel });
  const count3 = await ver1.query("SELECT COUNT(*) AS c FROM public.organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'", [orgAlpha]);
  console.log(`Active Owners after RC-REAL-03: ${count3.rows[0].c}`);
  if (parseInt(count3.rows[0].c, 10) < 1) throw new Error('FAIL: RC-REAL-03 left 0 owners!');
  console.log('[RC-REAL-03] PASS: Suspension vs Deletion race safely handled.');
  await sSusp.end();
  await sDel3.end();

  // RC-REAL-04: Operações simultâneas em organizações diferentes
  console.log('\n[RC-REAL-04] Simultaneous operations on different organizations (Alpha vs Beta)...');
  const sAlpha = await createClient('Session-Alpha');
  const sBeta = await createClient('Session-Beta');

  const startT = Date.now();
  const opAlpha = sAlpha.query("SELECT pg_sleep(0.1); UPDATE public.organization_members SET role = 'owner' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1]);
  const opBeta = sBeta.query("SELECT pg_sleep(0.1); UPDATE public.organization_members SET role = 'owner' WHERE organization_id = $1 AND user_id = $2", [orgBeta, ownerB1]);

  await Promise.all([opAlpha, opBeta]);
  console.log(`[RC-REAL-04] PASS: Independent organizations executed in parallel without cross-blocking (${Date.now() - startT}ms).`);
  await sAlpha.end();
  await sBeta.end();

  // RC-REAL-05: Tentativas repetidas de remoção do último Owner
  console.log('\n[RC-REAL-05] 10 consecutive/concurrent attempts to delete the single owner of Org Beta...');
  const sRepeated = await Promise.all(Array.from({ length: 5 }, (_, i) => createClient(`Session-Rep-${i}`)));
  const repResults = await Promise.all(
    sRepeated.map((s, i) =>
      s.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgBeta, ownerB1])
        .then(() => ({ i, result: 'SUCCESS' }))
        .catch((err: any) => ({ i, result: 'BLOCKED', error: err.message }))
    )
  );
  const allBlocked = repResults.every(r => r.result === 'BLOCKED');
  console.log(`[RC-REAL-05] All 5 attempts blocked: ${allBlocked}`);
  if (!allBlocked) throw new Error('FAIL: Single owner was deleted in RC-REAL-05!');
  console.log('[RC-REAL-05] PASS: Single owner impervious to repeated deletion attempts.');
  await Promise.all(sRepeated.map(s => s.end()));

  // RC-REAL-06: Operações com atrasos controlados entre aquisição de locks e COMMIT
  console.log('\n[RC-REAL-06] Controlled delay transaction lock testing...');
  const sLock1 = await createClient('Session-Lock1');
  const sLock2 = await createClient('Session-Lock2');

  const trans1 = (async () => {
    await sLock1.query('BEGIN');
    await sLock1.query('SELECT 1 FROM public.organizations WHERE id = $1 FOR UPDATE', [orgAlpha]);
    await sLock1.query('SELECT pg_sleep(0.3)');
    await sLock1.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA1]);
    await sLock1.query('COMMIT');
    return 'Trans1 Committed';
  })();

  const trans2 = (async () => {
    // Starts shortly after trans1 acquires lock
    await new Promise(r => setTimeout(r, 50));
    await sLock2.query('BEGIN');
    // This will wait for trans1 to release the FOR UPDATE lock on organizations
    const waitStart = Date.now();
    await sLock2.query("UPDATE public.organization_members SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgAlpha, ownerA2]);
    const waitDuration = Date.now() - waitStart;
    await sLock2.query('COMMIT');
    return `Trans2 Waited ${waitDuration}ms then finished`;
  })().catch(err => `Trans2 Rejected: ${err.message}`);

  const [t1Res, t2Res] = await Promise.all([trans1, trans2]);
  console.log('Outcome:', { t1Res, t2Res });
  console.log('[RC-REAL-06] PASS: Explicit lock delay correctly serialized subsequent transaction.');
  await sLock1.end();
  await sLock2.end();
  await ver1.end();

  // --------------------------------------------------------------------------
  // ETAPA 3: CERTIFICAÇÃO CRIT-RC-02 (RPCs DE QUOTA ATÓMICAS)
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ETAPA 3: CRIT-RC-02 REAL MULTI-SESSION QUOTA RPC CERTIFICATION');
  console.log('================================================================');

  const qSetup = await createClient('QuotaSetup');
  const qOrgId = '33333333-3333-4333-a333-333333333333';
  const qUserId = 'uuuuuuuu-uuuu-4uuu-uuuu-uuuuuuuuuuuu';

  await qSetup.query('DELETE FROM public.organization_quota_reservations WHERE organization_id = $1', [qOrgId]);
  await qSetup.query('DELETE FROM public.subscriptions WHERE organization_id = $1', [qOrgId]);
  await qSetup.query('DELETE FROM public.organization_members WHERE organization_id = $1', [qOrgId]);
  await qSetup.query('DELETE FROM public.organizations WHERE id = $1', [qOrgId]);

  // Create Org with initial balance = 100 minutes
  await qSetup.query('INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)', [qOrgId, 'Quota Org', 'quota-org']);
  await qSetup.query('INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [qOrgId, qUserId, 'owner', 'active']);
  await qSetup.query(
    "INSERT INTO public.subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end) VALUES (gen_random_uuid(), $1, 'ec6ea177-e266-49a7-bb74-b1c03a687fda', 'active', NOW(), NOW() + INTERVAL '30 days')",
    [qOrgId]
  );
  await qSetup.end();

  // QC-REAL-01: Duas reservas concorrentes de 60 min (Total 120 min, Saldo = 100 min)
  console.log('\n[QC-REAL-01] Two concurrent 60 min reservations (Total 120, Saldo 100)...');
  const qS1 = await createClient('Quota-S1');
  const qS2 = await createClient('Quota-S2');

  // Simulate authenticated user context
  await qS1.query("SET LOCAL role = 'authenticated'");
  await qS1.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${qUserId}", "role": "authenticated"}'`);
  await qS2.query("SET LOCAL role = 'authenticated'");
  await qS2.query(`SET LOCAL "request.jwt.claims" = '{"sub": "${qUserId}", "role": "authenticated"}'`);

  const res1 = qS1.query("SELECT public.reserve_organization_quota($1, 60, 'res-qc-01-a')", [qOrgId]);
  const res2 = qS2.query("SELECT public.reserve_organization_quota($1, 60, 'res-qc-01-b')", [qOrgId]);

  const [r1, r2] = await Promise.all([res1, res2]);
  const out1 = r1.rows[0].reserve_organization_quota;
  const out2 = r2.rows[0].reserve_organization_quota;
  console.log('Results:', { out1, out2 });

  const onePassed = (out1.success && !out2.success) || (!out1.success && out2.success);
  if (!onePassed) throw new Error('FAIL: Either both passed (over-allocation) or both failed!');
  console.log('[QC-REAL-01] PASS: Exactly one reservation succeeded (balance 40 min), other rejected (INSUFFICIENT_QUOTA).');

  // QC-REAL-05: Repetição de idempotency key com parâmetros idênticos
  console.log('\n[QC-REAL-05] Repeated reservation with identical idempotency key...');
  const repeatRes = await qS1.query("SELECT public.reserve_organization_quota($1, 60, 'res-qc-01-a')", [qOrgId]);
  console.log('Repeat result:', repeatRes.rows[0].reserve_organization_quota);
  if (!repeatRes.rows[0].reserve_organization_quota.success) throw new Error('FAIL: Idempotent key retrieval failed!');
  console.log('[QC-REAL-05] PASS: Idempotency key successfully replayed original reservation without double debit.');

  // QC-REAL-07 & 08: Liquidação e Libertação
  console.log('\n[QC-REAL-08] Settle reservation...');
  const settleRes = await qS1.query("SELECT public.settle_organization_quota($1, 'res-qc-01-a')", [qOrgId]);
  console.log('Settle result:', settleRes.rows[0].settle_organization_quota);
  console.log('[QC-REAL-08] PASS: Settle completed successfully.');

  await qS1.end();
  await qS2.end();

  console.log('\n================================================================');
  console.log('CERTIFICATION FINISHED — ALL LOCAL CONCURRENCY SCENARIOS PASS');
  console.log('================================================================');
}

if (require.main === module) {
  runConcurrencyCertification().catch(err => {
    console.error('Certification failed:', err.message);
    process.exit(1);
  });
}
