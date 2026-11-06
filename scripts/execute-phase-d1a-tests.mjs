import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.A');
console.log('REAL FINANCIAL INTEGRITY & AUDIT LOG SECURITY TESTS');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function runD1ATests() {
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

  // 1. D1.A.0: Pré-Verificação e Autenticação
  console.log('1. [D1.A.0] Pré-Verificação Obrigatória e Autenticação das Sessões Reais...');

  const cAlphaOwner = makeClient();
  const { data: sAlphaOwner, error: errAlphaOwner } = await cAlphaOwner.auth.signInWithPassword({
    email: alphaOwner.email,
    password: alphaOwner.password,
  });
  if (errAlphaOwner || !sAlphaOwner?.session) {
    throw new Error(`Falha ao autenticar Alpha Owner: ${errAlphaOwner?.message}`);
  }
  const tokenAlphaOwner = sAlphaOwner.session.access_token;

  const cAlphaMember = makeClient();
  const { data: sAlphaMember, error: errAlphaMember } = await cAlphaMember.auth.signInWithPassword({
    email: alphaMember.email,
    password: alphaMember.password,
  });
  if (errAlphaMember || !sAlphaMember?.session) {
    throw new Error(`Falha ao autenticar Alpha Member: ${errAlphaMember?.message}`);
  }
  const tokenAlphaMember = sAlphaMember.session.access_token;

  const cBetaOwner = makeClient();
  const { data: sBetaOwner, error: errBetaOwner } = await cBetaOwner.auth.signInWithPassword({
    email: betaOwner.email,
    password: betaOwner.password,
  });
  if (errBetaOwner || !sBetaOwner?.session) {
    throw new Error(`Falha ao autenticar Beta Owner: ${errBetaOwner?.message}`);
  }
  const tokenBetaOwner = sBetaOwner.session.access_token;

  const cExternal = makeClient();
  const { data: sExternal, error: errExternal } = await cExternal.auth.signInWithPassword({
    email: externalUser.email,
    password: externalUser.password,
  });
  if (errExternal || !sExternal?.session) {
    throw new Error(`Falha ao autenticar External User: ${errExternal?.message}`);
  }
  const tokenExternal = sExternal.session.access_token;

  // Clientes autenticados
  const clientAlphaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenAlphaOwner}` } },
    auth: { persistSession: false },
  });

  const clientAlphaMember = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenAlphaMember}` } },
    auth: { persistSession: false },
  });

  const clientBetaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenBetaOwner}` } },
    auth: { persistSession: false },
  });

  const clientExternal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenExternal}` } },
    auth: { persistSession: false },
  });

  console.log('   ✅ Todas as 4 identidades autenticadas e verificadas no Supabase Cloud Staging.\n');

  // Obter IDs de planos ativos
  const { data: plans } = await clientAlphaOwner.from('plans').select('id, code, name');
  const freePlan = plans?.find(p => p.code === 'free');
  const enterprisePlan = plans?.find(p => p.code === 'enterprise');

  if (!freePlan || !enterprisePlan) {
    throw new Error('Planos Free e Enterprise não encontrados na base de dados.');
  }

  const testResults = [];
  const confirmedVulnerabilities = [];

  // ==============================================================================
  // 2. D1.A.1: ALTERAÇÃO INDEVIDA DE FATURA
  // ==============================================================================
  console.log('2. [D1.A.1] Teste de Alteração Indevida de Faturas (PostgREST)...');

  const synthInvoiceNum = `INV-D1A-${Date.now()}`;
  const now = new Date();
  const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Inserir fatura sintética inicial como issued
  const { data: createdInvoice, error: errCreateInv } = await clientAlphaOwner
    .from('invoices')
    .insert({
      organization_id: alphaOrgId,
      invoice_number: synthInvoiceNum,
      currency: 'USD',
      subtotal_cents: 1900,
      tax_cents: 0,
      total_cents: 1900,
      status: 'issued',
      due_date: dueDate.toISOString(),
      billing_details: { test: 'D1.A.1 synthetic invoice' },
    })
    .select()
    .single();

  if (errCreateInv || !createdInvoice) {
    throw new Error(`Falha ao criar fatura sintética para teste: ${errCreateInv?.message}`);
  }
  const invoiceId = createdInvoice.id;
  console.log(`   - Fatura sintética criada: ID=${invoiceId}, Número=${synthInvoiceNum}, Status=${createdInvoice.status}`);

  // Teste 1.1: Alpha Member tenta alterar fatura para 'paid'
  const { data: memberInvUpd, error: errMemberInvUpd } = await clientAlphaMember
    .from('invoices')
    .update({ status: 'paid', total_cents: 0 })
    .eq('id', invoiceId)
    .select();
  const memberInvBlocked = (!memberInvUpd || memberInvUpd.length === 0) || !!errMemberInvUpd;
  console.log(`   - [D1.A.1.1] Alpha Member tenta marcar fatura como paga: ${memberInvBlocked ? 'BLOQUEADO ✅' : 'VULNERÁVEL ❌'}`);
  testResults.push({
    testId: 'D1.A.1.1',
    description: 'Alpha Member tenta atualizar status e valor de fatura',
    expected: 'Bloqueado por RLS (0 linhas)',
    actual: memberInvBlocked ? '0 linhas afetadas / erro' : 'Alterado com sucesso',
    passed: memberInvBlocked,
    details: { error: errMemberInvUpd?.message, affected: memberInvUpd?.length ?? 0 },
  });

  // Teste 1.2: Beta Owner tenta alterar fatura de Alpha
  const { data: betaInvUpd, error: errBetaInvUpd } = await clientBetaOwner
    .from('invoices')
    .update({ status: 'paid', total_cents: 0 })
    .eq('id', invoiceId)
    .select();
  const betaInvBlocked = (!betaInvUpd || betaInvUpd.length === 0) || !!errBetaInvUpd;
  console.log(`   - [D1.A.1.2] Beta Owner tenta alterar fatura de Alpha: ${betaInvBlocked ? 'BLOQUEADO ✅' : 'VULNERÁVEL ❌'}`);
  testResults.push({
    testId: 'D1.A.1.2',
    description: 'Beta Owner tenta atualizar fatura de outro tenant',
    expected: 'Bloqueado por RLS (0 linhas)',
    actual: betaInvBlocked ? '0 linhas afetadas / erro' : 'Alterado com sucesso',
    passed: betaInvBlocked,
    details: { error: errBetaInvUpd?.message, affected: betaInvUpd?.length ?? 0 },
  });

  // Teste 1.3: Alpha Owner tenta alterar status='paid' e total_cents=0 diretamente via PostgREST
  const { data: ownerInvUpd, error: errOwnerInvUpd } = await clientAlphaOwner
    .from('invoices')
    .update({ status: 'paid', total_cents: 0, payment_reference: 'FORGED_PAYMENT_BY_OWNER' })
    .eq('id', invoiceId)
    .select();

  // Verificar estado real pós-update
  const { data: verifyInv } = await clientAlphaOwner
    .from('invoices')
    .select('status, total_cents, payment_reference')
    .eq('id', invoiceId)
    .single();

  const invoiceTampered = verifyInv?.status === 'paid' && verifyInv?.total_cents === 0;
  console.log(`   - [D1.A.1.3] Alpha Owner tenta adulterar status='paid' e total_cents=0 via PostgREST:`);
  console.log(`     -> Antes: status='issued', total_cents=1900`);
  console.log(`     -> Depois: status='${verifyInv?.status}', total_cents=${verifyInv?.total_cents}, ref='${verifyInv?.payment_reference}'`);

  if (invoiceTampered) {
    console.log(`     ❌ VULNERABILIDADE CONFIRMADA [VULN-001]: Owner conseguiu forjar pagamento de fatura diretamente via PostgREST!`);
    confirmedVulnerabilities.push({
      id: 'VULN-001',
      title: 'Adulteração Direta de Fatura por Owner via PostgREST',
      table: 'public.invoices',
      policy: 'invoices_manage_admin',
      severity: 'ALTA',
      cvssScore: 7.1,
      impact: 'Um utilizador com papel owner ou admin pode marcar faturas como pagas e zerar total_cents via API PostgREST, contornando o webhook de pagamento.',
      evidence: {
        before: { status: 'issued', total_cents: 1900 },
        after: { status: verifyInv?.status, total_cents: verifyInv?.total_cents, payment_reference: verifyInv?.payment_reference },
      },
      remediationProposal: 'Substituir política FOR ALL por política que permita apenas SELECT e delegar transições de status e montantes para o webhook/service_role ou trigger que proíba atualização manual das colunas status, total_cents e subtotal_cents.',
    });
  } else {
    console.log(`     ✅ Protegido por trigger ou constraint de validação.`);
  }

  testResults.push({
    testId: 'D1.A.1.3',
    description: 'Alpha Owner tenta adulterar status da fatura para "paid" e zerar montante via PostgREST',
    expected: 'Rejeitado por trigger/constraint de proteção financeira',
    actual: invoiceTampered ? 'Adulterado com sucesso (VULNERABILIDADE CONFIRMADA)' : 'Operação bloqueada',
    passed: !invoiceTampered,
    details: { verifyInv, error: errOwnerInvUpd?.message },
  });

  // ==============================================================================
  // 3. D1.A.2: ALTERAÇÃO INDEVIDA DE SUBSCRIÇÃO
  // ==============================================================================
  console.log('\n3. [D1.A.2] Teste de Alteração Indevida de Subscrição (PostgREST)...');

  // Obter ou criar subscrição sintética com plano Free
  const subEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let subId;
  const { data: existingSub } = await clientAlphaOwner
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end')
    .eq('organization_id', alphaOrgId)
    .maybeSingle();

  if (existingSub) {
    subId = existingSub.id;
    await clientAlphaOwner
      .from('subscriptions')
      .update({
        plan_id: freePlan.id,
        current_period_end: subEndDate.toISOString(),
        status: 'active',
      })
      .eq('id', subId);
    console.log(`   - Subscrição sintética existente reutilizada e resetada para Free: ID=${subId}`);
  } else {
    const { data: createdSub, error: errCreateSub } = await clientAlphaOwner
      .from('subscriptions')
      .insert({
        organization_id: alphaOrgId,
        plan_id: freePlan.id,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: subEndDate.toISOString(),
        currency: 'USD',
        billing_interval: 'monthly',
        provider: 'mock',
      })
      .select()
      .single();

    if (errCreateSub || !createdSub) {
      throw new Error(`Falha ao criar subscrição sintética: ${errCreateSub?.message}`);
    }
    subId = createdSub.id;
    console.log(`   - Subscrição sintética criada: ID=${subId}, Plan=${freePlan.name}, Status=${createdSub.status}`);
  }

  // Teste 2.1: Alpha Member tenta alterar plan_id para Enterprise
  const { data: memberSubUpd, error: errMemberSubUpd } = await clientAlphaMember
    .from('subscriptions')
    .update({ plan_id: enterprisePlan.id })
    .eq('id', subId)
    .select();
  const memberSubBlocked = (!memberSubUpd || memberSubUpd.length === 0) || !!errMemberSubUpd;
  console.log(`   - [D1.A.2.1] Alpha Member tenta upgrade forjado para Enterprise: ${memberSubBlocked ? 'BLOQUEADO ✅' : 'VULNERÁVEL ❌'}`);
  testResults.push({
    testId: 'D1.A.2.1',
    description: 'Alpha Member tenta upgrade forjado para plano Enterprise',
    expected: 'Bloqueado por RLS (0 linhas)',
    actual: memberSubBlocked ? '0 linhas afetadas / erro' : 'Alterado com sucesso',
    passed: memberSubBlocked,
    details: { error: errMemberSubUpd?.message, affected: memberSubUpd?.length ?? 0 },
  });

  // Teste 2.2: Beta Owner tenta alterar subscrição de Alpha
  const { data: betaSubUpd, error: errBetaSubUpd } = await clientBetaOwner
    .from('subscriptions')
    .update({ plan_id: enterprisePlan.id })
    .eq('id', subId)
    .select();
  const betaSubBlocked = (!betaSubUpd || betaSubUpd.length === 0) || !!errBetaSubUpd;
  console.log(`   - [D1.A.2.2] Beta Owner tenta alterar subscrição de Alpha: ${betaSubBlocked ? 'BLOQUEADO ✅' : 'VULNERÁVEL ❌'}`);
  testResults.push({
    testId: 'D1.A.2.2',
    description: 'Beta Owner tenta alterar subscrição de outro tenant',
    expected: 'Bloqueado por RLS (0 linhas)',
    actual: betaSubBlocked ? '0 linhas afetadas / erro' : 'Alterado com sucesso',
    passed: betaSubBlocked,
    details: { error: errBetaSubUpd?.message, affected: betaSubUpd?.length ?? 0 },
  });

  // Teste 2.3: Alpha Owner tenta alterar diretamente plan_id para Enterprise e extender current_period_end para 2099
  const forgedPeriodEnd = '2099-12-31T23:59:59.000Z';
  const { data: ownerSubUpd, error: errOwnerSubUpd } = await clientAlphaOwner
    .from('subscriptions')
    .update({
      plan_id: enterprisePlan.id,
      current_period_end: forgedPeriodEnd,
    })
    .eq('id', subId)
    .select();

  // Verificar estado real pós-update
  const { data: verifySub } = await clientAlphaOwner
    .from('subscriptions')
    .select('plan_id, current_period_end, status')
    .eq('id', subId)
    .single();

  const subTampered = verifySub?.plan_id === enterprisePlan.id && (new Date(verifySub?.current_period_end).getFullYear() >= 2099);
  console.log(`   - [D1.A.2.3] Alpha Owner tenta adulterar plan_id para Enterprise e vigência para 2099 via PostgREST:`);
  console.log(`     -> Antes: plan_id='${freePlan.id}' (Free), period_end='${subEndDate.toISOString()}'`);
  console.log(`     -> Depois: plan_id='${verifySub?.plan_id}' (${verifySub?.plan_id === enterprisePlan.id ? 'Enterprise' : 'Free'}), period_end='${verifySub?.current_period_end}'`);

  if (subTampered) {
    console.log(`     ❌ VULNERABILIDADE CONFIRMADA [VULN-002]: Owner conseguiu fazer upgrade forçado para Enterprise e extensão perpétua diretamente via PostgREST!`);
    confirmedVulnerabilities.push({
      id: 'VULN-002',
      title: 'Upgrade Forçado e Extensão de Subscrição por Owner via PostgREST',
      table: 'public.subscriptions',
      policy: 'subscriptions_manage_owner',
      severity: 'ALTA',
      cvssScore: 7.7,
      impact: 'Um utilizador com papel owner consegue atualizar plan_id e current_period_end diretamente no PostgREST, contornando a cobrança e obtendo recursos Enterprise vitalícios sem pagar.',
      evidence: {
        before: { plan_id: freePlan.id, current_period_end: subEndDate.toISOString() },
        after: { plan_id: verifySub?.plan_id, current_period_end: verifySub?.current_period_end },
      },
      remediationProposal: 'Remover permissão de UPDATE direto nas colunas plan_id e current_period_end para authenticated; permitir apenas cancel_at_period_end e delegar alterações de plano e datas ao webhook com service_role.',
    });
  } else {
    console.log(`     ✅ Protegido por trigger ou restrição.`);
  }

  testResults.push({
    testId: 'D1.A.2.3',
    description: 'Alpha Owner tenta upgrade de plano e extensão de vigência via PostgREST sem checkout',
    expected: 'Rejeitado por trigger/constraint de proteção de subscrição',
    actual: subTampered ? 'Adulterado com sucesso (VULNERABILIDADE CONFIRMADA)' : 'Operação bloqueada',
    passed: !subTampered,
    details: { verifySub, error: errOwnerSubUpd?.message },
  });

  // ==============================================================================
  // 4. D1.A.3: FALSIFICAÇÃO DE AUDIT LOGS
  // ==============================================================================
  console.log('\n4. [D1.A.3] Teste de Falsificação de Registos de Auditoria (PostgREST)...');

  const backdatedTimestamp = '2020-01-01T00:00:00.000Z';
  const forgedAction = `admin.organization.ownership_transferred_synthetic_${Date.now()}`;

  // Alpha Member insere log forjando user_id como Alpha Owner e created_at como 2020 (sem .select() para não colidir com select RLS de member)
  const { error: errForgedLog } = await clientAlphaMember
    .from('audit_logs')
    .insert({
      organization_id: alphaOrgId,
      user_id: alphaOwner.id, // Forjando autor como o Owner
      action: forgedAction,
      resource_type: 'organization',
      resource_id: alphaOrgId,
      metadata: { attack_vector: 'D1.A.3 identity and timestamp spoofing', forged: true },
      ip_address: '198.51.100.1', // IP fictício arbitrário
      created_at: backdatedTimestamp,
    });

  console.log(`   - [D1.A.3.1] Alpha Member submete log com user_id do Owner e data de 2020:`);
  console.log(`     -> Erro de Inserção: ${errForgedLog ? errForgedLog.message : 'Nenhum erro (inserção 201 aceita)'}`);

  // Consultar registo armazenado como Alpha Owner
  const { data: storedLogs } = await clientAlphaOwner
    .from('audit_logs')
    .select('id, user_id, action, created_at, organization_id')
    .eq('action', forgedAction);

  const storedLog = storedLogs && storedLogs.length > 0 ? storedLogs[0] : null;

  let auditSpoofed = false;
  if (!errForgedLog && storedLog) {
    const isUserIdForged = storedLog.user_id === alphaOwner.id;
    const isTimestampForged = new Date(storedLog.created_at).getFullYear() === 2020;
    auditSpoofed = isUserIdForged && isTimestampForged;

    console.log(`     -> user_id registado: ${storedLog.user_id} (${isUserIdForged ? 'FORJADO COMO OWNER ❌' : 'SUBSTITUÍDO PELO AUTOR REAL ✅'})`);
    console.log(`     -> created_at registado: ${storedLog.created_at} (${isTimestampForged ? 'FORJADO COMO 2020 ❌' : 'IMPOSTO PELO SERVIDOR ✅'})`);

    if (auditSpoofed) {
      console.log(`     ❌ VULNERABILIDADE CONFIRMADA [VULN-003]: Inserção de log com identidade de terceiro e data arbitrária foi aceite sem sanitização!`);
      confirmedVulnerabilities.push({
        id: 'VULN-003',
        title: 'Falsificação de Identidade e Timestamp em audit_logs',
        table: 'public.audit_logs',
        policy: 'audit_logs_insert',
        severity: 'MÉDIA',
        cvssScore: 6.5,
        impact: 'Membros da organização podem inserir registos de auditoria forjando a autoria de outros membros ou do Owner, além de retrodatar eventos, comprometendo a integridade forense da pista de auditoria.',
        evidence: {
          insertedByUserId: alphaMember.id,
          storedUserId: storedLog.user_id,
          requestedCreatedAt: backdatedTimestamp,
          storedCreatedAt: storedLog.created_at,
          action: forgedAction,
        },
        remediationProposal: 'Adicionar trigger BEFORE INSERT ON public.audit_logs que force: NEW.user_id := auth.uid(); NEW.created_at := NOW(); ou atualizar a política RLS com WITH CHECK (user_id = auth.uid()).',
      });
    }
  }

  testResults.push({
    testId: 'D1.A.3.1',
    description: 'Alpha Member tenta forjar autoria de Owner e data de 2020 em audit_logs',
    expected: 'Rejeitado por RLS ou sanitizado para auth.uid() e NOW()',
    actual: auditSpoofed ? 'Log forjado aceite com sucesso (VULNERABILIDADE CONFIRMADA)' : 'Operação rejeitada ou sanitizada',
    passed: !auditSpoofed,
    details: { storedLog, error: errForgedLog?.message },
  });

  // ==============================================================================
  // 5. CONSOLIDAÇÃO E GERAÇÃO DO MANIFESTO JSON
  // ==============================================================================
  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n==============================================================================');
  console.log('RESULTADO DA FASE D1.A:');
  console.log(`- Testes de Segurança Executados: ${totalTests}`);
  console.log(`- Testes Aprovados: ${passedTests}`);
  console.log(`- Vulnerabilidades Confirmadas: ${confirmedVulnerabilities.length}`);
  console.log('==============================================================================');

  const evidence = {
    timestamp: new Date().toISOString(),
    supabaseProject: SUPABASE_URL,
    totalTests,
    passedTests,
    failedTests,
    financialIntegrityStatus: confirmedVulnerabilities.some(v => v.id.startsWith('VULN-001') || v.id.startsWith('VULN-002')) ? 'FAIL' : 'PASS',
    auditLogsStatus: confirmedVulnerabilities.some(v => v.id.startsWith('VULN-003')) ? 'FAIL' : 'PASS',
    confirmedVulnerabilitiesCount: confirmedVulnerabilities.length,
    confirmedVulnerabilities,
    testResults,
  };

  const evidenceFilePath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-phase-d1a-results.json');
  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidence, null, 2), 'utf-8');
  console.log(`Relatório JSON gravado em: ${evidenceFilePath}`);
}

runD1ATests().catch(err => {
  console.error('\n❌ Erro durante a execução da Fase D1.A:', err);
  process.exit(1);
});
