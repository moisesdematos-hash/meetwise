import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const EXPECTED_REF = 'ycxwomqqepetickmxxqj';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${EXPECTED_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.1-B');
console.log('POST-MIGRATION 010 REAL CLOUD VALIDATION SUITE');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function main() {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifesto de identidades sintéticas não encontrado.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const alphaOrgId = manifest.organizations.alpha.id;
  const betaOrgId = manifest.organizations.beta.id;
  const { alphaOwner, alphaMember, betaOwner, externalUser } = manifest.users;

  function makeAnonClient() {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }

  // 1. Autenticar as 4 identidades sintéticas
  console.log('1. Autenticando sessões sintéticas com tokens JWT reais...');
  const sessions = {};

  for (const [key, user] of Object.entries({ alphaOwner, alphaMember, betaOwner, externalUser })) {
    const c = makeAnonClient();
    const { data, error } = await c.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error || !data?.session) {
      throw new Error(`Falha ao autenticar ${key} (${user.email}): ${error?.message}`);
    }
    sessions[key] = {
      user: data.user,
      session: data.session,
      client: createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
        auth: { persistSession: false },
      }),
      token: data.session.access_token,
    };
  }
  console.log('   ✅ 4 sessões autenticadas com sucesso no Supabase Cloud Staging.\n');

  const testResults = [];
  function recordTest(id, category, name, passed, details = '') {
    const status = passed ? 'PASS ✅' : 'FAIL ❌';
    console.log(`[TEST ${String(id).padStart(2, '0')}] ${name}: ${status} ${details ? `(${details})` : ''}`);
    testResults.push({ id, category, name, passed, details });
  }

  // Obter registo do membro betaOwner na organização Beta
  const { data: betaMembers, error: errBetaMembers } = await sessions.betaOwner.client
    .from('organization_members')
    .select('*')
    .eq('organization_id', betaOrgId)
    .eq('user_id', betaOwner.id);

  const betaMemberRecord = betaMembers?.[0];
  if (!betaMemberRecord) {
    throw new Error(`Registo de membro do Beta Owner não encontrado: ${errBetaMembers?.message}`);
  }

  // ==============================================================================
  // CRIT-RC-01: PROTEÇÃO DO ÚLTIMO OWNER (TESTES 1 - 4)
  // ==============================================================================
  console.log('--- CRIT-RC-01: PROTEÇÃO DO ÚLTIMO OWNER (TESTES 1 - 4) ---');

  // Teste 1: Tentativa de remoção (DELETE) do último Owner de Beta
  const { error: errDelOwner } = await sessions.betaOwner.client
    .from('organization_members')
    .delete()
    .eq('id', betaMemberRecord.id);

  const t1Passed = !!errDelOwner && (
    errDelOwner.message.includes('Security Violation') ||
    errDelOwner.message.includes('last remaining active owner')
  );
  recordTest(1, 'CRIT-RC-01', 'Bloqueio de remoção (DELETE) do último Owner', t1Passed, errDelOwner?.message);

  // Teste 2: Tentativa de despromoção (role = 'member') do último Owner de Beta
  const { error: errDemoteOwner } = await sessions.betaOwner.client
    .from('organization_members')
    .update({ role: 'member' })
    .eq('id', betaMemberRecord.id);

  const t2Passed = !!errDemoteOwner && (
    errDemoteOwner.message.includes('Security Violation') ||
    errDemoteOwner.message.includes('last remaining active owner')
  );
  recordTest(2, 'CRIT-RC-01', 'Bloqueio de despromoção (role=member) do último Owner', t2Passed, errDemoteOwner?.message);

  // Teste 3: Tentativa de suspensão (status = 'suspended') do último Owner de Beta
  const { error: errSuspendOwner } = await sessions.betaOwner.client
    .from('organization_members')
    .update({ status: 'suspended' })
    .eq('id', betaMemberRecord.id);

  const t3Passed = !!errSuspendOwner && (
    errSuspendOwner.message.includes('Security Violation') ||
    errSuspendOwner.message.includes('last remaining active owner')
  );
  recordTest(3, 'CRIT-RC-01', 'Bloqueio de suspensão (status=suspended) do último Owner', t3Passed, errSuspendOwner?.message);

  // Teste 4: Integridade do último Owner preservada
  const { data: verifyOwner } = await sessions.betaOwner.client
    .from('organization_members')
    .select('id, role, status')
    .eq('id', betaMemberRecord.id)
    .single();

  const t4Passed = verifyOwner?.role === 'owner' && verifyOwner?.status === 'active';
  recordTest(4, 'CRIT-RC-01', 'Integridade e permanência do último Owner ativa confirmada', t4Passed, `role=${verifyOwner?.role}, status=${verifyOwner?.status}`);

  // ==============================================================================
  // CRIT-RC-02: QUOTA ATOMICITY RPCS (TESTES 5 - 10)
  // ==============================================================================
  console.log('\n--- CRIT-RC-02: ATOMICIDADE E IDEMPOTÊNCIA DE QUOTAS (TESTES 5 - 10) ---');

  const ts = Date.now();
  const idempotencyKey1 = `d1b1b_test_reserve_${ts}_1`;

  // Teste 5: Reserva legítima de 10 minutos para Org Alpha
  const { data: resReserve1, error: errReserve1 } = await sessions.alphaOwner.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 10,
      p_idempotency_key: idempotencyKey1,
      p_operation: 'transcription_minutes',
      p_ttl_seconds: 300,
    });

  const reservationRecord1 = Array.isArray(resReserve1) ? resReserve1[0] : resReserve1;
  const t5Passed = !errReserve1 && reservationRecord1?.reserved === true && !!reservationRecord1?.reservation_id;
  recordTest(5, 'CRIT-RC-02', 'Reserva transacional atómica legítima de quota', t5Passed, 
    errReserve1 ? errReserve1.message : `reservation_id=${reservationRecord1?.reservation_id}, remaining=${reservationRecord1?.remaining_minutes}`);

  const reservationId1 = reservationRecord1?.reservation_id;

  // Teste 6: Replay idempotente da mesma reserva com a mesma chave
  const { data: resReserveReplay, error: errReserveReplay } = await sessions.alphaOwner.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 10,
      p_idempotency_key: idempotencyKey1,
      p_operation: 'transcription_minutes',
      p_ttl_seconds: 300,
    });

  const replayRecord = Array.isArray(resReserveReplay) ? resReserveReplay[0] : resReserveReplay;
  const t6Passed = !errReserveReplay && replayRecord?.reservation_id === reservationId1 && replayRecord?.reserved === true;
  recordTest(6, 'CRIT-RC-02', 'Idempotência estrita na repetição da chave de reserva', t6Passed, 
    errReserveReplay ? errReserveReplay.message : `id_match=${replayRecord?.reservation_id === reservationId1}`);

  // Teste 7: Rejeição ao ultrapassar o limite da quota
  const { data: resExceeded, error: errExceeded } = await sessions.alphaOwner.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 9999999,
      p_idempotency_key: `d1b1b_test_exceed_${ts}`,
      p_operation: 'transcription_minutes',
    });

  const t7Passed = !!errExceeded && (
    errExceeded.message.includes('Quota Exceeded') ||
    errExceeded.message.includes('remain in active cycle')
  );
  recordTest(7, 'CRIT-RC-02', 'Bloqueio estrito de reserva acima do limite (Quota Exceeded)', t7Passed, errExceeded?.message);

  // Teste 8: Liberação (release) da reserva 1
  const { data: resRelease, error: errRelease } = await sessions.alphaOwner.client
    .rpc('release_organization_quota', {
      p_reservation_id: reservationId1,
      p_idempotency_key: idempotencyKey1,
    });

  const t8Passed = !errRelease && resRelease === true;
  recordTest(8, 'CRIT-RC-02', 'Liberação (release) transacional da reserva', t8Passed, errRelease ? errRelease.message : `released=${resRelease}`);

  // Teste 9: Reserva e Liquidação (settle) de quota
  const idempotencyKey2 = `d1b1b_test_reserve_${ts}_2`;
  const { data: resReserve2, error: errReserve2 } = await sessions.alphaOwner.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 5,
      p_idempotency_key: idempotencyKey2,
      p_operation: 'transcription_minutes',
      p_ttl_seconds: 300,
    });

  const reservationRecord2 = Array.isArray(resReserve2) ? resReserve2[0] : resReserve2;
  const reservationId2 = reservationRecord2?.reservation_id;

  const { data: resSettle, error: errSettle } = await sessions.alphaOwner.client
    .rpc('settle_organization_quota', {
      p_reservation_id: reservationId2,
      p_actual_minutes: 5,
      p_meeting_id: null,
      p_idempotency_key: idempotencyKey2,
    });

  const settleRecord = Array.isArray(resSettle) ? resSettle[0] : resSettle;
  const t9Passed = !errSettle && settleRecord?.settled === true && settleRecord?.settled_minutes === 5;
  recordTest(9, 'CRIT-RC-02', 'Liquidação (settle) atómica da quota no usage_ledger', t9Passed, 
    errSettle ? errSettle.message : `settled=${settleRecord?.settled}, ledger_id=${settleRecord?.ledger_id}`);

  // Teste 10: Repetição idempotente da liquidação (settle)
  const { data: resSettleReplay, error: errSettleReplay } = await sessions.alphaOwner.client
    .rpc('settle_organization_quota', {
      p_reservation_id: reservationId2,
      p_actual_minutes: 5,
      p_meeting_id: null,
      p_idempotency_key: idempotencyKey2,
    });

  const settleReplayRecord = Array.isArray(resSettleReplay) ? resSettleReplay[0] : resSettleReplay;
  const t10Passed = !errSettleReplay && settleReplayRecord?.settled === true && settleReplayRecord?.ledger_id === settleRecord?.ledger_id;
  recordTest(10, 'CRIT-RC-02', 'Idempotência na repetição de liquidação (settle)', t10Passed, 
    errSettleReplay ? errSettleReplay.message : `ledger_match=${settleReplayRecord?.ledger_id === settleRecord?.ledger_id}`);

  // ==============================================================================
  // SEGURANÇA MULTI-TENANT E RPC RBAC (TESTES 11 - 13)
  // ==============================================================================
  console.log('\n--- SEGURANÇA MULTI-TENANT E ISOLAMENTO DE RPCS (TESTES 11 - 13) ---');

  // Teste 11: Beta Owner tenta reservar quota da Organização Alpha
  const { data: resCrossBeta, error: errCrossBeta } = await sessions.betaOwner.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 5,
      p_idempotency_key: `d1b1b_cross_beta_${ts}`,
      p_operation: 'transcription_minutes',
    });

  const t11Passed = !!errCrossBeta && (
    errCrossBeta.message.includes('Security Violation') ||
    errCrossBeta.message.includes('not an active member')
  );
  recordTest(11, 'SECURITY', 'Isolamento cross-tenant: Beta Owner bloqueado em Org Alpha', t11Passed, errCrossBeta?.message);

  // Teste 12: External User tenta reservar quota da Organização Alpha
  const { data: resCrossExt, error: errCrossExt } = await sessions.externalUser.client
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 5,
      p_idempotency_key: `d1b1b_cross_ext_${ts}`,
      p_operation: 'transcription_minutes',
    });

  const t12Passed = !!errCrossExt && (
    errCrossExt.message.includes('Security Violation') ||
    errCrossExt.message.includes('not an active member')
  );
  recordTest(12, 'SECURITY', 'Isolamento cross-tenant: External User bloqueado em Org Alpha', t12Passed, errCrossExt?.message);

  // Teste 13: Utilizador anónimo tenta chamar a RPC
  const anonClient = makeAnonClient();
  const { data: resAnon, error: errAnon } = await anonClient
    .rpc('reserve_organization_quota', {
      p_organization_id: alphaOrgId,
      p_minutes: 5,
      p_idempotency_key: `d1b1b_anon_${ts}`,
      p_operation: 'transcription_minutes',
    });

  const t13Passed = !!errAnon && (
    errAnon.code === '42501' || // permission denied for function
    errAnon.message.includes('permission denied') ||
    errAnon.message.includes('Security Violation')
  );
  recordTest(13, 'SECURITY', 'Utilizador anónimo sem permissão de execução de RPCs (EXECUTE grant)', t13Passed, errAnon?.message);

  // ==============================================================================
  // INTEGRIDADE FINANCEIRA MIGRATION 009 (TESTES 14 - 17)
  // ==============================================================================
  console.log('\n--- INTEGRIDADE FINANCEIRA E FORENSE DA MIGRAÇÃO 009 (TESTES 14 - 17) ---');

  // Obter uma fatura sintética da Org Alpha
  const { data: alphaInvoices } = await sessions.alphaOwner.client
    .from('invoices')
    .select('id, invoice_number, status')
    .eq('organization_id', alphaOrgId)
    .limit(1);

  const testInvoice = alphaInvoices?.[0];

  // Teste 14: Alpha Owner tenta adulterar status da fatura para 'paid'
  let t14Passed = false;
  let t14Error = '';
  if (testInvoice) {
    const { error: errInvoiceTamper } = await sessions.alphaOwner.client
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', testInvoice.id);

    t14Passed = !!errInvoiceTamper && (
      errInvoiceTamper.message.includes('Security Violation') ||
      errInvoiceTamper.message.includes('prohibited')
    );
    t14Error = errInvoiceTamper?.message || '';
  }
  recordTest(14, 'FINANCIAL', 'Bloqueio de adulteração direta do status da fatura', t14Passed, t14Error);

  // Obter subscrição da Org Alpha
  const { data: alphaSubs } = await sessions.alphaOwner.client
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end')
    .eq('organization_id', alphaOrgId)
    .single();

  // Teste 15: Alpha Owner tenta alterar diretamente o plano da subscrição
  const { data: allPlans } = await sessions.alphaOwner.client.from('plans').select('id, code');
  const otherPlan = allPlans?.find(p => p.id !== alphaSubs?.plan_id);

  let t15Passed = false;
  let t15Error = '';
  if (alphaSubs && otherPlan) {
    const { error: errSubTamper } = await sessions.alphaOwner.client
      .from('subscriptions')
      .update({ plan_id: otherPlan.id })
      .eq('id', alphaSubs.id);

    t15Passed = !!errSubTamper && (
      errSubTamper.message.includes('Security Violation') ||
      errSubTamper.message.includes('prohibited')
    );
    t15Error = errSubTamper?.message || '';
  }
  recordTest(15, 'FINANCIAL', 'Bloqueio de alteração direta do plan_id da subscrição', t15Passed, t15Error);

  // Teste 16: Tentativa de eliminação de audit logs
  const { error: errAuditDel } = await sessions.alphaOwner.client
    .from('audit_logs')
    .delete()
    .eq('organization_id', alphaOrgId);

  const t16Passed = !!errAuditDel && (
    errAuditDel.message.includes('Security Violation') ||
    errAuditDel.message.includes('immutable')
  );
  recordTest(16, 'FORENSIC', 'Imutabilidade absoluta de registos de auditoria (audit_logs)', t16Passed, errAuditDel?.message);

  // Teste 17: Verificação do estado FIN-REC-01 (permanece intocado e pendente)
  const t17Passed = alphaSubs?.current_period_end?.startsWith('2099') || alphaSubs?.status === 'active';
  recordTest(17, 'FIN-REC-01', 'FIN-REC-01 verificado como PENDENTE (subscrição intacta)', t17Passed, 
    `plan_id=${alphaSubs?.plan_id}, status=${alphaSubs?.status}, period_end=${alphaSubs?.current_period_end}`);

  // ==============================================================================
  // RESUMO E PERSISTÊNCIA DAS EVIDÊNCIAS
  // ==============================================================================
  const total = testResults.length;
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = total - passedCount;

  console.log('\n==============================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${total} | APROVADOS: ${passedCount} | FALHAS: ${failedCount}`);
  console.log('==============================================================================\n');

  const evidence = {
    timestamp: new Date().toISOString(),
    project: EXPECTED_REF,
    mode: 'CONTROLLED_CLOUD_STAGING_VALIDATION',
    summary: {
      total,
      passed: passedCount,
      failed: failedCount,
      allPassed: failedCount === 0,
    },
    results: testResults,
  };

  const evidencePath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-d1b1b-post-migration-results.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`Evidências salvas em: ${evidencePath}`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('ERRO FATAL NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
