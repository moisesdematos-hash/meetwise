import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.C.2');
console.log('POST-MIGRATION 009 REAL CLOUD VALIDATION (17 SCENARIOS)');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function runPostMigrationTests() {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifesto de identidades sintéticas não encontrado.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const alphaOrgId = manifest.organizations.alpha.id;
  const betaOrgId = manifest.organizations.beta.id;
  const { alphaOwner, alphaMember, betaOwner, externalUser } = manifest.users;

  function makeClient() {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }

  // 1. Autenticar as 4 identidades sintéticas
  console.log('1. Autenticando sessões sintéticas com tokens JWT reais...');

  const cAlphaOwner = makeClient();
  const { data: sAlphaOwner, error: errAlphaOwner } = await cAlphaOwner.auth.signInWithPassword({
    email: alphaOwner.email,
    password: alphaOwner.password,
  });
  if (errAlphaOwner || !sAlphaOwner?.session) {
    throw new Error(`Falha ao autenticar Alpha Owner: ${errAlphaOwner?.message}`);
  }

  const cAlphaMember = makeClient();
  const { data: sAlphaMember, error: errAlphaMember } = await cAlphaMember.auth.signInWithPassword({
    email: alphaMember.email,
    password: alphaMember.password,
  });
  if (errAlphaMember || !sAlphaMember?.session) {
    throw new Error(`Falha ao autenticar Alpha Member: ${errAlphaMember?.message}`);
  }

  const cBetaOwner = makeClient();
  const { data: sBetaOwner, error: errBetaOwner } = await cBetaOwner.auth.signInWithPassword({
    email: betaOwner.email,
    password: betaOwner.password,
  });
  if (errBetaOwner || !sBetaOwner?.session) {
    throw new Error(`Falha ao autenticar Beta Owner: ${errBetaOwner?.message}`);
  }

  const cExternal = makeClient();
  const { data: sExternal, error: errExternal } = await cExternal.auth.signInWithPassword({
    email: externalUser.email,
    password: externalUser.password,
  });
  if (errExternal || !sExternal?.session) {
    throw new Error(`Falha ao autenticar External User: ${errExternal?.message}`);
  }

  console.log('   ✅ 4 sessões autenticadas com sucesso no Supabase Cloud Staging.\n');

  const clientAlphaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sAlphaOwner.session.access_token}` } },
    auth: { persistSession: false },
  });

  const clientAlphaMember = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sAlphaMember.session.access_token}` } },
    auth: { persistSession: false },
  });

  const clientBetaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sBetaOwner.session.access_token}` } },
    auth: { persistSession: false },
  });

  // Obter IDs de planos para testes
  const { data: plans } = await clientAlphaOwner.from('plans').select('id, code, name');
  const freePlan = plans?.find(p => p.code === 'free');
  const enterprisePlan = plans?.find(p => p.code === 'enterprise');
  if (!freePlan || !enterprisePlan) {
    throw new Error('Planos Free e Enterprise não encontrados na base de dados.');
  }

  // Obter subscrição da Org Alpha
  const { data: alphaSubs } = await clientAlphaOwner
    .from('subscriptions')
    .select('*')
    .eq('organization_id', alphaOrgId);
  const alphaSub = alphaSubs?.[0];
  if (!alphaSub) {
    throw new Error('Subscrição da Organização Alpha não encontrada.');
  }

  // Obter fatura sintética reconciliada existente da Org Alpha para os testes de integridade
  const { data: alphaInvoices, error: errGetInvoices } = await clientAlphaOwner
    .from('invoices')
    .select('*')
    .eq('organization_id', alphaOrgId)
    .like('invoice_number', 'INV-D1A-%');

  const testInvoice = alphaInvoices?.find(i => i.status === 'issued') || alphaInvoices?.[0];
  if (!testInvoice) {
    throw new Error(`Fatura sintética da Org Alpha não encontrada: ${errGetInvoices?.message}`);
  }
  const invoiceId = testInvoice.id;
  console.log(`   - Fatura sintética de teste carregada: ID=${invoiceId}, Número=${testInvoice.invoice_number}, Status=${testInvoice.status}\n`);

  const results = [];

  // ==============================================================================
  // 1. FATURAS (TESTES 1 - 5)
  // ==============================================================================
  console.log('--- TESTES DE INTEGRIDADE FINANCEIRA: FATURAS (1-5) ---');

  // Teste 1: Alpha Owner tenta alterar status para paid
  const { data: r1, error: err1 } = await clientAlphaOwner
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)
    .select();
  const t1Passed = !!err1 && (err1.message.includes('Security Violation') || err1.message.includes('prohibited'));
  console.log(`[TEST 01] Alpha Owner tenta alterar status para paid: ${t1Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err1?.message || 'Sem erro'})`);
  results.push({ id: 1, category: 'invoices', name: 'Alpha Owner tenta alterar status para paid', passed: t1Passed, error: err1?.message });

  // Teste 2: Alpha Owner tenta alterar total_cents
  const { data: r2, error: err2 } = await clientAlphaOwner
    .from('invoices')
    .update({ total_cents: 0 })
    .eq('id', invoiceId)
    .select();
  const t2Passed = !!err2 && (err2.message.includes('Security Violation') || err2.message.includes('prohibited'));
  console.log(`[TEST 02] Alpha Owner tenta alterar total_cents para 0: ${t2Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err2?.message || 'Sem erro'})`);
  results.push({ id: 2, category: 'invoices', name: 'Alpha Owner tenta alterar total_cents', passed: t2Passed, error: err2?.message });

  // Teste 3: Alpha Member tenta modificar fatura
  const { data: r3, error: err3 } = await clientAlphaMember
    .from('invoices')
    .update({ billing_details: { spoofed_by_member: true } })
    .eq('id', invoiceId)
    .select();
  const t3Passed = (!r3 || r3.length === 0) || !!err3;
  console.log(`[TEST 03] Alpha Member tenta modificar fatura: ${t3Passed ? 'PASS (BLOQUEADO POR RLS) ✅' : 'FAIL ❌'}`);
  results.push({ id: 3, category: 'invoices', name: 'Alpha Member tenta modificar fatura', passed: t3Passed, error: err3?.message });

  // Teste 4: Beta Owner tenta modificar fatura Alpha
  const { data: r4, error: err4 } = await clientBetaOwner
    .from('invoices')
    .update({ billing_details: { cross_org_attack: true } })
    .eq('id', invoiceId)
    .select();
  const t4Passed = (!r4 || r4.length === 0) || !!err4;
  console.log(`[TEST 04] Beta Owner tenta modificar fatura Alpha: ${t4Passed ? 'PASS (ISOLAMENTO MULTI-TENANT) ✅' : 'FAIL ❌'}`);
  results.push({ id: 4, category: 'invoices', name: 'Beta Owner tenta modificar fatura Alpha', passed: t4Passed, error: err4?.message });

  // Teste 5: Fluxo backend autorizado / leitura legítima continua funcional
  const { data: r5, error: err5 } = await clientAlphaOwner
    .from('invoices')
    .select('id, invoice_number, status, total_cents, billing_details')
    .eq('id', invoiceId)
    .single();
  const t5Passed = !err5 && r5?.status === 'issued' && r5?.total_cents === 1900;
  console.log(`[TEST 05] Leitura legítima e integridade dos dados preservada: ${t5Passed ? 'PASS ✅' : 'FAIL ❌'}`);
  results.push({ id: 5, category: 'invoices', name: 'Leitura autorizada de faturas preservada', passed: t5Passed, data: r5 });

  // ==============================================================================
  // 2. SUBSCRIÇÕES (TESTES 6 - 10)
  // ==============================================================================
  console.log('\n--- TESTES DE INTEGRIDADE FINANCEIRA: SUBSCRIÇÕES (6-10) ---');

  // Teste 6: Alpha Owner tenta alterar plan_id
  const attackPlanId = alphaSub.plan_id === enterprisePlan.id ? freePlan.id : enterprisePlan.id;
  const { data: r6, error: err6 } = await clientAlphaOwner
    .from('subscriptions')
    .update({ plan_id: attackPlanId })
    .eq('id', alphaSub.id)
    .select();
  const t6Passed = !!err6 && (err6.message.includes('Security Violation') || err6.message.includes('prohibited'));
  console.log(`[TEST 06] Alpha Owner tenta upgrade forçado de plano: ${t6Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err6?.message || 'Sem erro'})`);
  results.push({ id: 6, category: 'subscriptions', name: 'Alpha Owner tenta alterar plan_id', passed: t6Passed, error: err6?.message });

  // Teste 7: Alpha Owner tenta estender current_period_end
  const attackPeriodEnd = alphaSub.current_period_end?.startsWith('2099') ? '2035-01-01T00:00:00.000Z' : '2099-12-31T23:59:59.000Z';
  const { data: r7, error: err7 } = await clientAlphaOwner
    .from('subscriptions')
    .update({ current_period_end: attackPeriodEnd })
    .eq('id', alphaSub.id)
    .select();
  const t7Passed = !!err7 && (err7.message.includes('Security Violation') || err7.message.includes('prohibited'));
  console.log(`[TEST 07] Alpha Owner tenta estender período de vigência: ${t7Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err7?.message || 'Sem erro'})`);
  results.push({ id: 7, category: 'subscriptions', name: 'Alpha Owner tenta estender current_period_end', passed: t7Passed, error: err7?.message });

  // Teste 8: Alpha Member tenta upgrade
  const { data: r8, error: err8 } = await clientAlphaMember
    .from('subscriptions')
    .update({ plan_id: enterprisePlan.id })
    .eq('id', alphaSub.id)
    .select();
  const t8Passed = (!r8 || r8.length === 0) || !!err8;
  console.log(`[TEST 08] Alpha Member tenta upgrade: ${t8Passed ? 'PASS (BLOQUEADO POR RLS) ✅' : 'FAIL ❌'}`);
  results.push({ id: 8, category: 'subscriptions', name: 'Alpha Member tenta upgrade', passed: t8Passed, error: err8?.message });

  // Teste 9: Beta Owner tenta alterar subscrição Alpha
  const { data: r9, error: err9 } = await clientBetaOwner
    .from('subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('id', alphaSub.id)
    .select();
  const t9Passed = (!r9 || r9.length === 0) || !!err9;
  console.log(`[TEST 09] Beta Owner tenta alterar subscrição de Alpha: ${t9Passed ? 'PASS (ISOLAMENTO MULTI-TENANT) ✅' : 'FAIL ❌'}`);
  results.push({ id: 9, category: 'subscriptions', name: 'Beta Owner tenta alterar subscrição Alpha', passed: t9Passed, error: err9?.message });

  // Teste 10: Cancelamento legítimo permanece funcional
  const { data: r10, error: err10 } = await clientAlphaOwner
    .from('subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('id', alphaSub.id)
    .select();
  const t10Passed = !err10 && r10?.length > 0 && r10[0]?.cancel_at_period_end === true;
  console.log(`[TEST 10] Cancelamento legítimo por Owner (cancel_at_period_end = true): ${t10Passed ? 'PASS (PERMITIDO) ✅' : 'FAIL ❌'} (${err10?.message || 'OK'})`);
  results.push({ id: 10, category: 'subscriptions', name: 'Cancelamento legítimo permitido', passed: t10Passed, error: err10?.message });

  // Reverter cancel_at_period_end para false no teste
  await clientAlphaOwner
    .from('subscriptions')
    .update({ cancel_at_period_end: false })
    .eq('id', alphaSub.id);

  // ==============================================================================
  // 3. AUDITORIA (TESTES 11 - 17)
  // ==============================================================================
  console.log('\n--- TESTES DE INTEGRIDADE E IMUTABILIDADE: AUDIT LOGS (11-17) ---');

  // Teste 11: Member tenta falsificar user_id
  const nonce11 = `spoof-user-${Date.now()}`;
  const { error: err11 } = await clientAlphaMember
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      action: 'document.viewed',
      resource_type: 'document',
      user_id: alphaOwner.id, // Forjar identidade do Owner
      metadata: { test: '11', nonce: nonce11 }
    });

  // Alpha Owner consulta o log inserido para verificar a autoria efetiva
  const { data: logs11 } = await clientAlphaOwner
    .from('audit_logs')
    .select('id, user_id, action, created_at, metadata')
    .eq('organization_id', alphaOrgId)
    .eq('metadata->>nonce', nonce11);

  const insertedLog11 = logs11?.[0];
  const t11Passed = (!err11 && insertedLog11 && insertedLog11.user_id === alphaMember.id) || (!!err11 && err11.message.includes('violates row-level security'));
  console.log(`[TEST 11] Member tenta falsificar autoria (user_id): ${t11Passed ? 'PASS (SANITIZADO / BLOQUEADO) ✅' : 'FAIL ❌'} (Autor efetivo: ${insertedLog11?.user_id})`);
  results.push({ id: 11, category: 'audit_logs', name: 'Member tenta falsificar user_id', passed: t11Passed, sanitizedUser: insertedLog11?.user_id });

  // Teste 12: Member tenta falsificar created_at
  const forgedTimestamp = '2021-01-01T00:00:00.000Z';
  const nonce12 = `spoof-time-${Date.now()}`;
  const { error: err12 } = await clientAlphaMember
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      action: 'document.viewed',
      resource_type: 'document',
      created_at: forgedTimestamp,
      metadata: { test: '12', nonce: nonce12 }
    });

  const { data: logs12 } = await clientAlphaOwner
    .from('audit_logs')
    .select('id, user_id, action, created_at, metadata')
    .eq('organization_id', alphaOrgId)
    .eq('metadata->>nonce', nonce12);

  const insertedLog12 = logs12?.[0];
  const t12Passed = !err12 && insertedLog12 && insertedLog12.created_at !== forgedTimestamp && new Date(insertedLog12.created_at).getFullYear() >= 2026;
  console.log(`[TEST 12] Member tenta falsificar timestamp created_at: ${t12Passed ? 'PASS (SANITIZADO PARA NOW) ✅' : 'FAIL ❌'} (Timestamp efetivo: ${insertedLog12?.created_at})`);
  results.push({ id: 12, category: 'audit_logs', name: 'Member tenta falsificar created_at', passed: t12Passed, sanitizedTimestamp: insertedLog12?.created_at });

  // Teste 13: Owner tenta emitir evento financeiro de sistema
  const { data: r13, error: err13 } = await clientAlphaOwner
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      action: 'billing.payment_confirmed',
      metadata: { spoofed_payment: true }
    })
    .select();
  const t13Passed = !!err13 && (err13.message.includes('Security Violation') || err13.message.includes('prohibited'));
  console.log(`[TEST 13] Owner tenta emitir evento financeiro de sistema (billing.%): ${t13Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err13?.message || 'Sem erro'})`);
  results.push({ id: 13, category: 'audit_logs', name: 'Owner tenta emitir evento billing.%', passed: t13Passed, error: err13?.message });

  // Teste 14: Admin tenta emitir evento financeiro de sistema
  const { data: r14, error: err14 } = await clientAlphaMember
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      action: 'billing.invoice_created',
      metadata: { spoofed_invoice: true }
    });
  const t14Passed = !!err14 && (err14.message.includes('Security Violation') || err14.message.includes('prohibited'));
  console.log(`[TEST 14] Admin/Member tenta emitir evento billing.%: ${t14Passed ? 'PASS (BLOQUEADO) ✅' : 'FAIL ❌'} (${err14?.message || 'Sem erro'})`);
  results.push({ id: 14, category: 'audit_logs', name: 'Admin/Member tenta emitir evento billing.%', passed: t14Passed, error: err14?.message });

  // Teste 15: UPDATE em audit_logs é bloqueado
  const auditTargetId = insertedLog12?.id || insertedLog11?.id || 'fd7ed5ab-8092-443d-a21e-cfc67b0322fd';
  let t15Passed = false;
  let err15Msg = '';
  if (auditTargetId) {
    const { data: r15, error: err15 } = await clientAlphaOwner
      .from('audit_logs')
      .update({ action: 'tampered.action' })
      .eq('id', auditTargetId)
      .select();
    t15Passed = !!err15 && (err15.message.includes('Security Violation') || err15.message.includes('immutable'));
    err15Msg = err15?.message || '';
  }
  console.log(`[TEST 15] UPDATE em audit_logs: ${t15Passed ? 'PASS (BLOQUEADO / IMUTÁVEL) ✅' : 'FAIL ❌'} (${err15Msg})`);
  results.push({ id: 15, category: 'audit_logs', name: 'UPDATE em audit_logs bloqueado', passed: t15Passed, error: err15Msg });

  // Teste 16: DELETE em audit_logs é bloqueado
  let t16Passed = false;
  let err16Msg = '';
  if (auditTargetId) {
    const { data: r16, error: err16 } = await clientAlphaOwner
      .from('audit_logs')
      .delete()
      .eq('id', auditTargetId)
      .select();
    t16Passed = !!err16 && (err16.message.includes('Security Violation') || err16.message.includes('immutable'));
    err16Msg = err16?.message || '';
  }
  console.log(`[TEST 16] DELETE em audit_logs: ${t16Passed ? 'PASS (BLOQUEADO / IMUTÁVEL) ✅' : 'FAIL ❌'} (${err16Msg})`);
  results.push({ id: 16, category: 'audit_logs', name: 'DELETE em audit_logs bloqueado', passed: t16Passed, error: err16Msg });

  // Teste 17: Evento legítimo de sistema/membro é registado corretamente
  const nonce17 = `legit-${Date.now()}`;
  const { error: err17 } = await clientAlphaMember
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      action: 'meeting.document_viewed',
      resource_type: 'document',
      metadata: { meeting_id: 'legitimate-meeting-id', nonce: nonce17 }
    });

  const { data: logs17 } = await clientAlphaOwner
    .from('audit_logs')
    .select('id, user_id, action, created_at, metadata')
    .eq('organization_id', alphaOrgId)
    .eq('metadata->>nonce', nonce17);

  const insertedLog17 = logs17?.[0];
  const t17Passed = !err17 && !!insertedLog17;
  console.log(`[TEST 17] Evento legítimo de membro (meeting.document_viewed): ${t17Passed ? 'PASS (REGISTADO) ✅' : 'FAIL ❌'} (${err17?.message || 'OK'})`);
  results.push({ id: 17, category: 'audit_logs', name: 'Evento legítimo de membro registado', passed: t17Passed, data: insertedLog17 });

  // Resumo
  const totalPassed = results.filter(r => r.passed).length;
  console.log('\n==============================================================================');
  console.log(`RESULTADO FINAL DOS 17 TESTES PÓS-MIGRAÇÃO: ${totalPassed} / 17 PASS`);
  console.log('==============================================================================\n');

  const outPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-phase-d1c2-results.json');
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    project: 'ycxwomqqepetickmxxqj',
    totalTests: 17,
    passedTests: totalPassed,
    results
  }, null, 2), 'utf-8');

  if (totalPassed !== 17) {
    throw new Error(`Nem todos os testes foram aprovados: ${totalPassed}/17 PASS`);
  }
}

runPostMigrationTests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES PÓS-MIGRAÇÃO:', err);
  process.exit(1);
});
