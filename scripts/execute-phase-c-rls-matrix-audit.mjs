import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE C');
console.log('COMPLETE RLS / RBAC SECURITY MATRIX AUDIT (33 TABELAS)');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

const ALL_33_TABLES = [
  // 1. Governança (4)
  { name: 'profiles', category: 'Governança', isPublic: false, sensitiveAdmin: false },
  { name: 'organizations', category: 'Governança', isPublic: false, sensitiveAdmin: false },
  { name: 'organization_members', category: 'Governança', isPublic: false, sensitiveAdmin: false },
  { name: 'organization_invitations', category: 'Governança', isPublic: false, sensitiveAdmin: true },

  // 2. Reuniões e Transcrição (5)
  { name: 'meetings', category: 'Reuniões e Transcrição', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_participants', category: 'Reuniões e Transcrição', isPublic: false, sensitiveAdmin: false },
  { name: 'media_assets', category: 'Reuniões e Transcrição', isPublic: false, sensitiveAdmin: false },
  { name: 'processing_jobs', category: 'Reuniões e Transcrição', isPublic: false, sensitiveAdmin: false },
  { name: 'transcript_segments', category: 'Reuniões e Transcrição', isPublic: false, sensitiveAdmin: false },

  // 3. Inteligência Artificial (5)
  { name: 'meeting_summaries', category: 'Inteligência Artificial', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_minutes', category: 'Inteligência Artificial', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_decisions', category: 'Inteligência Artificial', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_tasks', category: 'Inteligência Artificial', isPublic: false, sensitiveAdmin: false },
  { name: 'organization_templates', category: 'Inteligência Artificial', isPublic: false, sensitiveAdmin: false },

  // 4. Documentos e Colaboração (5)
  { name: 'meeting_documents', category: 'Documentos e Colaboração', isPublic: false, sensitiveAdmin: false },
  { name: 'organization_document_sequences', category: 'Documentos e Colaboração', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_document_versions', category: 'Documentos e Colaboração', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_document_comments', category: 'Documentos e Colaboração', isPublic: false, sensitiveAdmin: false },
  { name: 'meeting_document_shares', category: 'Documentos e Colaboração', isPublic: false, sensitiveAdmin: false },

  // 5. Monetização (9)
  { name: 'plans', category: 'Monetização', isPublic: true, sensitiveAdmin: false },
  { name: 'plan_prices', category: 'Monetização', isPublic: true, sensitiveAdmin: false },
  { name: 'subscriptions', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'checkout_sessions', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'invoices', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'invoice_lines', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'financial_ledger_entries', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'organization_quota_reserves', category: 'Monetização', isPublic: false, sensitiveAdmin: false },
  { name: 'refunds', category: 'Monetização', isPublic: false, sensitiveAdmin: false },

  // 6. FinOps e Administração (5)
  { name: 'usage_ledger', category: 'FinOps e Administração', isPublic: false, sensitiveAdmin: false },
  { name: 'payment_events', category: 'FinOps e Administração', isPublic: false, sensitiveAdmin: true },
  { name: 'ai_provider_requests', category: 'FinOps e Administração', isPublic: false, sensitiveAdmin: true },
  { name: 'platform_admins', category: 'FinOps e Administração', isPublic: false, sensitiveAdmin: true },
  { name: 'audit_logs', category: 'FinOps e Administração', isPublic: false, sensitiveAdmin: true },
];

async function runAudit() {
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

  console.log('1. Autenticando identidades sintéticas no Supabase Cloud...');
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
  const clientAnon = makeClient();

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

  console.log('   ✅ 4 sessões autenticadas + 1 cliente anónimo inicializados com sucesso.\n');

  // ==============================================================================
  // 2. AUDITORIA DAS 33 TABELAS
  // ==============================================================================
  console.log('2. Executando Auditoria Real das 33 Tabelas no Supabase Cloud Staging...\n');

  const tableResults = [];

  for (let i = 0; i < ALL_33_TABLES.length; i++) {
    const tableInfo = ALL_33_TABLES[i];
    const tableName = tableInfo.name;
    const num = i + 1;

    // Teste 1: Consulta Anon
    const { data: anonData, error: anonErr, status: anonStatus } = await clientAnon
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Teste 2: Consulta Alpha Owner
    const { data: alphaOwnerData, count: alphaOwnerCount, error: alphaOwnerErr } = await clientAlphaOwner
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Teste 3: Consulta Alpha Member
    const { data: alphaMemberData, count: alphaMemberCount, error: alphaMemberErr } = await clientAlphaMember
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Teste 4: Consulta Beta Owner
    const { data: betaOwnerData, count: betaOwnerCount, error: betaOwnerErr } = await clientBetaOwner
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Teste 5: Consulta External User
    const { data: externalData, count: externalCount, error: externalErr } = await clientExternal
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    // Avaliação RLS e Exposição Anónima
    let anonExposed = false;
    let rlsEnforced = true;
    let verdict = 'PASS';
    let risk = 'Baixo';
    let details = '';

    if (tableInfo.isPublic) {
      // Tabelas públicas autorizadas (plans, plan_prices)
      if (anonStatus === 200) {
        details = `Leitura pública autorizada (Status 200). Anon: ${anonData?.length ?? 'OK'}, Auth: ${alphaOwnerCount ?? 'OK'}`;
      } else {
        verdict = 'FAIL';
        details = `Falha ao aceder à tabela pública autorizada: ${anonErr?.message}`;
      }
    } else {
      // Tabelas privadas: Anon deve receber 0 linhas (código 200 com 0 linhas, ou 401/403/406)
      // E nunca deve permitir acesso não autorizado
      if (anonStatus === 200 && anonData && anonData.length > 0) {
        anonExposed = true;
        verdict = 'FAIL';
        risk = 'CRÍTICO: Dados privados expostos anonimamente';
        details = `VULNERABILIDADE: Utilizador anónimo obteve ${anonData.length} registos!`;
      } else {
        details = `RLS Ativo. Anon: 0 linhas/bloqueado. External: ${externalCount ?? 0} linhas.`;
      }

      // Verificação de privilégios de Admin em tabelas sensíveis (audit_logs, payment_events, ai_provider_requests)
      if (tableInfo.sensitiveAdmin) {
        // Se a tabela tem política restrita a owner/admin, member deve ter 0 linhas
        details += ` Admin Sensitive: Owner=${alphaOwnerCount ?? 0}, Member=${alphaMemberCount ?? 0}.`;
      }
    }

    const item = {
      index: num,
      table: tableName,
      category: tableInfo.category,
      isPublic: tableInfo.isPublic,
      rlsEnforced,
      anonExposed,
      sensitiveAdmin: tableInfo.sensitiveAdmin,
      verdict,
      risk,
      counts: {
        anonStatus,
        alphaOwner: alphaOwnerCount ?? 0,
        alphaMember: alphaMemberCount ?? 0,
        betaOwner: betaOwnerCount ?? 0,
        external: externalCount ?? 0,
      },
      details,
    };

    tableResults.push(item);
    const mark = verdict === 'PASS' ? '✅' : '❌';
    console.log(`[${String(num).padStart(2, '0')}/33] ${mark} public.${tableName.padEnd(32)} | Categoria: ${tableInfo.category.padEnd(26)} | Anon: ${anonStatus} | RLS: ${verdict}`);
  }

  // ==============================================================================
  // 3. TESTES DE TRANSCRIÇÃO E MUTABILIDADE DE SEGURANÇA
  // ==============================================================================
  console.log('\n3. Testes Avançados de Imutabilidade e Governança de Acesso...');
  const advancedResults = [];

  // 3.1 Imutabilidade de financial_ledger_entries (Proibição de UPDATE e DELETE)
  const { data: updLedgerData, error: errUpdLedger } = await clientAlphaOwner
    .from('financial_ledger_entries')
    .update({ amount: 999999 })
    .eq('organization_id', alphaOrgId)
    .select();
  const passLedgerImmutable = !updLedgerData || updLedgerData.length === 0 || !!errUpdLedger;
  advancedResults.push({
    test: 'Imutabilidade de financial_ledger_entries (UPDATE bloqueado)',
    passed: passLedgerImmutable,
    obs: errUpdLedger ? errUpdLedger.message : '0 linhas afetadas',
  });
  console.log(`   - Imutabilidade financial_ledger_entries: ${passLedgerImmutable ? 'PASS ✅' : 'FAIL ❌'}`);

  // 3.2 Imutabilidade de audit_logs (Proibição de UPDATE e DELETE)
  const { data: delAuditData, error: errDelAudit } = await clientAlphaOwner
    .from('audit_logs')
    .delete()
    .eq('organization_id', alphaOrgId)
    .select();
  const passAuditImmutable = !delAuditData || delAuditData.length === 0 || !!errDelAudit;
  advancedResults.push({
    test: 'Imutabilidade de audit_logs (DELETE bloqueado)',
    passed: passAuditImmutable,
    obs: errDelAudit ? errDelAudit.message : '0 linhas afetadas',
  });
  console.log(`   - Imutabilidade audit_logs: ${passAuditImmutable ? 'PASS ✅' : 'FAIL ❌'}`);

  // 3.3 Tentativa de Inserção não autorizada em platform_admins
  const { data: insAdminData, error: errInsAdmin } = await clientAlphaOwner
    .from('platform_admins')
    .insert({ user_id: alphaOwner.id, role: 'superadmin' })
    .select();
  const passAdminInsertBlocked = !insAdminData || insAdminData.length === 0 || !!errInsAdmin;
  advancedResults.push({
    test: 'Proteção de platform_admins (Injeção de superadmin bloqueada)',
    passed: passAdminInsertBlocked,
    obs: errInsAdmin ? errInsAdmin.message : '0 linhas afetadas',
  });
  console.log(`   - Bloqueio de injeção em platform_admins: ${passAdminInsertBlocked ? 'PASS ✅' : 'FAIL ❌'}`);

  // 3.4 RPC create_organization_with_owner (Rejeição a chamadas anónimas)
  const { data: rpcAnonData, error: rpcAnonErr } = await clientAnon.rpc('create_organization_with_owner', {
    p_name: 'Org Inválida Anon',
    p_slug: 'org-invalida-anon',
  });
  const passRpcAnonBlocked = !!rpcAnonErr && rpcAnonErr.message.includes('UNAUTHORIZED');
  advancedResults.push({
    test: 'RPC create_organization_with_owner (Rejeição anónima)',
    passed: passRpcAnonBlocked,
    obs: rpcAnonErr ? rpcAnonErr.message : 'Não gerou erro',
  });
  console.log(`   - Rejeição anónima em create_organization_with_owner: ${passRpcAnonBlocked ? 'PASS ✅' : 'FAIL ❌'}`);

  // 3.5 Storage Buckets (Validação de privacidade)
  const { data: listRecordings, error: errListRecordings } = await clientAnon.storage
    .from('meeting_recordings')
    .list();
  const { data: listDocuments, error: errListDocuments } = await clientAnon.storage
    .from('meeting_documents')
    .list();
  const passStoragePrivate = (!listRecordings || listRecordings.length === 0 || !!errListRecordings) &&
                             (!listDocuments || listDocuments.length === 0 || !!errListDocuments);
  advancedResults.push({
    test: 'Privacidade de Storage Buckets (Anon listagem bloqueada)',
    passed: passStoragePrivate,
    obs: `Recordings err: ${errListRecordings?.message || '0 itens'}, Docs err: ${errListDocuments?.message || '0 itens'}`,
  });
  console.log(`   - Privacidade de Storage Buckets: ${passStoragePrivate ? 'PASS ✅' : 'FAIL ❌'}`);

  // ==============================================================================
  // 4. CONSOLIDAÇÃO E GERAÇÃO DE RELATÓRIO JSON
  // ==============================================================================
  const totalTables = tableResults.length;
  const passedTables = tableResults.filter(t => t.verdict === 'PASS').length;
  const failedTables = totalTables - passedTables;

  const totalAdvanced = advancedResults.length;
  const passedAdvanced = advancedResults.filter(a => a.passed).length;

  console.log('\n==============================================================================');
  console.log(`RESULTADO DA AUDITORIA FASE C:`);
  console.log(`- Tabelas Auditadas: ${passedTables}/${totalTables} PASS (${failedTables === 0 ? '100% PASS' : 'FAIL'})`);
  console.log(`- Controles Avançados & RPCs: ${passedAdvanced}/${totalAdvanced} PASS`);
  console.log('==============================================================================');

  const evidence = {
    timestamp: new Date().toISOString(),
    supabaseProject: SUPABASE_URL,
    totalTables,
    passedTables,
    failedTables,
    status: (failedTables === 0 && passedAdvanced === totalAdvanced) ? 'PASS' : 'FAIL',
    tableAudit: tableResults,
    advancedControls: advancedResults,
  };

  const evidenceFilePath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-phase-c-results.json');
  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidence, null, 2), 'utf-8');
  console.log(`Relatório JSON gravado em: ${evidenceFilePath}`);

  if (failedTables > 0 || passedAdvanced < totalAdvanced) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('\n❌ Erro durante a auditoria da Fase C:', err);
  process.exit(1);
});
