import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE B: REAL MULTI-TENANT ISOLATION');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function runMultiTenantIsolation() {
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

  // 1. Obter tokens de autenticação reais para todas as identidades
  console.log('1. Autenticando identidades sintéticas no Supabase Cloud...');
  
  const cAlphaOwner = makeClient();
  const { data: sAlphaOwner, error: errAlphaOwner } = await cAlphaOwner.auth.signInWithPassword({ email: alphaOwner.email, password: alphaOwner.password });
  if (errAlphaOwner || !sAlphaOwner?.session) {
    throw new Error(`Falha ao autenticar Alpha Owner: ${errAlphaOwner?.message || 'Sessão nula'}`);
  }
  const tokenAlphaOwner = sAlphaOwner.session.access_token;

  const cAlphaMember = makeClient();
  const { data: sAlphaMember, error: errAlphaMember } = await cAlphaMember.auth.signInWithPassword({ email: alphaMember.email, password: alphaMember.password });
  if (errAlphaMember || !sAlphaMember?.session) {
    throw new Error(`Falha ao autenticar Alpha Member: ${errAlphaMember?.message || 'Sessão nula'}`);
  }
  const tokenAlphaMember = sAlphaMember.session.access_token;

  const cBetaOwner = makeClient();
  const { data: sBetaOwner, error: errBetaOwner } = await cBetaOwner.auth.signInWithPassword({ email: betaOwner.email, password: betaOwner.password });
  if (errBetaOwner || !sBetaOwner?.session) {
    throw new Error(`Falha ao autenticar Beta Owner: ${errBetaOwner?.message || 'Sessão nula'}`);
  }
  const tokenBetaOwner = sBetaOwner.session.access_token;

  const cExternal = makeClient();
  const { data: sExternal, error: errExternal } = await cExternal.auth.signInWithPassword({ email: externalUser.email, password: externalUser.password });
  if (errExternal || !sExternal?.session) {
    throw new Error(`Falha ao autenticar External User: ${errExternal?.message || 'Sessão nula'}`);
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

  const results = [];

  function recordResult(testId, name, expected, actual, passed, details = {}) {
    results.push({ testId, name, expected, actual, passed, details });
    const mark = passed ? 'PASS ✅' : 'FAIL ❌';
    console.log(`[${testId}] ${name}: ${mark} (Obs: ${actual})`);
  }

  // 2. Preparar Dados Sintéticos Mínimos (1 reunião em Alpha e 1 reunião em Beta)
  console.log('\n2. Criando recursos sintéticos mínimos para comprovar isolamento RLS real...');

  const alphaMeetingTitle = 'Reunião Estratégica Alpha — Confidencial 2026';
  const { data: alphaMeeting, error: errCreateAlphaMeeting } = await clientAlphaOwner
    .from('meetings')
    .insert({
      organization_id: alphaOrgId,
      title: alphaMeetingTitle,
      created_by: alphaOwner.id,
      status: 'created',
    })
    .select('id, title, organization_id')
    .single();

  if (errCreateAlphaMeeting || !alphaMeeting) {
    throw new Error(`Falha ao criar reunião de teste em Alpha: ${errCreateAlphaMeeting?.message}`);
  }
  const alphaMeetingId = alphaMeeting.id;
  console.log(`   - Reunião Alpha criada: ID=${alphaMeetingId}`);

  const betaMeetingTitle = 'Reunião Estratégica Beta — Confidencial 2026';
  const { data: betaMeeting, error: errCreateBetaMeeting } = await clientBetaOwner
    .from('meetings')
    .insert({
      organization_id: betaOrgId,
      title: betaMeetingTitle,
      created_by: betaOwner.id,
      status: 'created',
    })
    .select('id, title, organization_id')
    .single();

  if (errCreateBetaMeeting || !betaMeeting) {
    throw new Error(`Falha ao criar reunião de teste em Beta: ${errCreateBetaMeeting?.message}`);
  }
  const betaMeetingId = betaMeeting.id;
  console.log(`   - Reunião Beta criada: ID=${betaMeetingId}`);

  // ==============================================================================
  // 3. TESTES DE LEITURA (B1 a B6)
  // ==============================================================================
  console.log('\n--- 3. TESTES DE LEITURA AUTENTICADA (B1 a B6) ---');

  // Teste B1 — Leitura Alpha
  const { data: b1Data } = await clientAlphaOwner.from('meetings').select('id, title, organization_id').eq('id', alphaMeetingId);
  const b1Pass = b1Data?.length === 1 && b1Data[0].id === alphaMeetingId;
  recordResult('B1', 'Leitura Alpha (Alpha Owner consulta dados de Alpha)', '1 linha retornada', `${b1Data?.length ?? 0} linhas`, b1Pass, { data: b1Data });

  // Teste B2 — Leitura Beta
  const { data: b2Data } = await clientBetaOwner.from('meetings').select('id, title, organization_id').eq('id', betaMeetingId);
  const b2Pass = b2Data?.length === 1 && b2Data[0].id === betaMeetingId;
  recordResult('B2', 'Leitura Beta (Beta Owner consulta dados de Beta)', '1 linha retornada', `${b2Data?.length ?? 0} linhas`, b2Pass, { data: b2Data });

  // Teste B3 — Alpha tenta ler Beta
  const { data: b3Data } = await clientAlphaOwner.from('meetings').select('id, title, organization_id').eq('id', betaMeetingId);
  const b3Pass = b3Data?.length === 0;
  recordResult('B3', 'Alpha tenta ler Beta (Alpha Owner tenta ler reunião de Beta)', '0 linhas (bloqueio RLS)', `${b3Data?.length ?? 0} linhas`, b3Pass);

  // Teste B4 — Beta tenta ler Alpha
  const { data: b4Data } = await clientBetaOwner.from('meetings').select('id, title, organization_id').eq('id', alphaMeetingId);
  const b4Pass = b4Data?.length === 0;
  recordResult('B4', 'Beta tenta ler Alpha (Beta Owner tenta ler reunião de Alpha)', '0 linhas (bloqueio RLS)', `${b4Data?.length ?? 0} linhas`, b4Pass);

  // Teste B5 — Utilizador Externo tenta ler Alpha ou Beta
  const { data: b5DataAlpha } = await clientExternal.from('meetings').select('id, title').eq('id', alphaMeetingId);
  const { data: b5DataBeta } = await clientExternal.from('meetings').select('id, title').eq('id', betaMeetingId);
  const b5Pass = (b5DataAlpha?.length === 0) && (b5DataBeta?.length === 0);
  recordResult('B5', 'Utilizador Externo tenta ler Alpha ou Beta', '0 linhas em ambos', `Alpha: ${b5DataAlpha?.length ?? 0}, Beta: ${b5DataBeta?.length ?? 0}`, b5Pass);

  // Teste B6 — Alpha Member consulta Alpha
  const { data: b6Data } = await clientAlphaMember.from('meetings').select('id, title, organization_id').eq('id', alphaMeetingId);
  const { data: b6CrossData } = await clientAlphaMember.from('meetings').select('id, title').eq('id', betaMeetingId);
  const b6Pass = (b6Data?.length === 1) && (b6CrossData?.length === 0);
  recordResult('B6', 'Alpha Member (Lê dados permitidos de Alpha, zero de Beta)', '1 linha em Alpha, 0 de Beta', `Alpha: ${b6Data?.length ?? 0}, Beta: ${b6CrossData?.length ?? 0}`, b6Pass);

  // ==============================================================================
  // 4. TESTES DE ESCRITA CRUZADA (B7 a B11)
  // ==============================================================================
  console.log('\n--- 4. TESTES DE ESCRITA CRUZADA (B7 a B11) ---');

  // Teste B7 — INSERT cruzado (Alpha tenta criar reunião associada a Beta)
  const { data: b7Data, error: b7Err } = await clientAlphaOwner
    .from('meetings')
    .insert({
      organization_id: betaOrgId,
      title: 'Tentativa Invasiva Alpha em Beta',
      created_by: alphaOwner.id,
      status: 'created',
    })
    .select('id');
  const b7Pass = !!b7Err || (!b7Data || b7Data.length === 0);
  recordResult('B7', 'INSERT cruzado (Alpha tenta criar recurso em Beta)', 'Rejeitado por RLS (erro ou 0 linhas)', b7Err ? `Erro: ${b7Err.message}` : `${b7Data?.length ?? 0} linhas`, b7Pass);

  // Teste B8 — UPDATE cruzado (Alpha tenta alterar reunião de Beta)
  const { data: b8Data, error: b8Err } = await clientAlphaOwner
    .from('meetings')
    .update({ title: 'TÍTULO ALTERADO MALICIOSAMENTE POR ALPHA' })
    .eq('id', betaMeetingId)
    .select();
  // Verificar estado real com Beta Owner
  const { data: checkBetaAfterB8 } = await clientBetaOwner.from('meetings').select('title').eq('id', betaMeetingId).single();
  const b8Pass = (b8Data?.length === 0 || !!b8Err) && checkBetaAfterB8?.title === betaMeetingTitle;
  recordResult('B8', 'UPDATE cruzado (Alpha tenta alterar recurso de Beta)', '0 linhas afetadas, título Beta intacto', `Afetados: ${b8Data?.length ?? 0}, Título atual: "${checkBetaAfterB8?.title}"`, b8Pass);

  // Teste B9 — DELETE cruzado (Alpha tenta eliminar reunião de Beta)
  const { data: b9Data, error: b9Err } = await clientAlphaOwner
    .from('meetings')
    .delete()
    .eq('id', betaMeetingId)
    .select();
  // Verificar se o recurso permanece intacto
  const { data: checkBetaAfterB9 } = await clientBetaOwner.from('meetings').select('id').eq('id', betaMeetingId);
  const b9Pass = (b9Data?.length === 0 || !!b9Err) && checkBetaAfterB9?.length === 1;
  recordResult('B9', 'DELETE cruzado (Alpha tenta eliminar recurso de Beta)', '0 linhas eliminadas, reunião Beta permanece intacta', `Eliminados: ${b9Data?.length ?? 0}, Existente: ${checkBetaAfterB9?.length === 1}`, b9Pass);

  // Teste B10 — Direção Inversa (Beta tenta INSERT, UPDATE, DELETE em Alpha)
  const { error: b10InsertErr } = await clientBetaOwner.from('meetings').insert({
    organization_id: alphaOrgId,
    title: 'Tentativa Invasiva Beta em Alpha',
    created_by: betaOwner.id,
    status: 'created',
  });
  const { data: b10UpdateData } = await clientBetaOwner.from('meetings').update({ title: 'TÍTULO ALTERADO POR BETA' }).eq('id', alphaMeetingId).select();
  const { data: b10DeleteData } = await clientBetaOwner.from('meetings').delete().eq('id', alphaMeetingId).select();
  const { data: checkAlphaAfterB10 } = await clientAlphaOwner.from('meetings').select('title').eq('id', alphaMeetingId).single();

  const b10Pass = (!!b10InsertErr) && (b10UpdateData?.length === 0) && (b10DeleteData?.length === 0) && checkAlphaAfterB10?.title === alphaMeetingTitle;
  recordResult('B10', 'Direção Inversa (Beta tenta INSERT, UPDATE, DELETE em Alpha)', 'Todas as 3 operações bloqueadas, Alpha intacto', `Insert Err: ${!!b10InsertErr}, Upd: ${b10UpdateData?.length ?? 0}, Del: ${b10DeleteData?.length ?? 0}`, b10Pass);

  // Teste B11 — Utilizador Externo tenta INSERT, UPDATE, DELETE em Alpha e Beta
  const { error: b11InsertErr } = await clientExternal.from('meetings').insert({
    organization_id: alphaOrgId,
    title: 'Tentativa Invasiva Utilizador Externo',
    created_by: externalUser.id,
    status: 'created',
  });
  const { data: b11UpdateData } = await clientExternal.from('meetings').update({ title: 'MODIFICADO POR EXTERNAL' }).eq('id', alphaMeetingId).select();
  const { data: b11DeleteData } = await clientExternal.from('meetings').delete().eq('id', alphaMeetingId).select();

  const b11Pass = (!!b11InsertErr) && (b11UpdateData?.length === 0) && (b11DeleteData?.length === 0);
  recordResult('B11', 'Utilizador Externo tenta INSERT, UPDATE, DELETE', 'Todas as operações bloqueadas por RLS', `Insert Err: ${!!b11InsertErr}, Upd: ${b11UpdateData?.length ?? 0}, Del: ${b11DeleteData?.length ?? 0}`, b11Pass);

  // ==============================================================================
  // 5. TESTES DE MANIPULAÇÃO DE IDENTIFICADORES (B12 a B16)
  // ==============================================================================
  console.log('\n--- 5. TESTES DE MANIPULAÇÃO DE IDENTIFICADORES (B12 a B16) ---');

  // Teste B12 — Troca de organization_id (Alpha Owner tenta alterar o organization_id da sua própria reunião para Beta)
  const { data: b12Data, error: b12Err } = await clientAlphaOwner
    .from('meetings')
    .update({ organization_id: betaOrgId })
    .eq('id', alphaMeetingId)
    .select();
  // Verificar se o organization_id foi mantido
  const { data: checkAlphaOrgAfterB12 } = await clientAlphaOwner.from('meetings').select('organization_id').eq('id', alphaMeetingId).single();
  const b12Pass = (b12Data?.length === 0 || !!b12Err) && checkAlphaOrgAfterB12?.organization_id === alphaOrgId;
  recordResult('B12', 'Troca de organization_id (Tentativa de mover reunião de Alpha para Beta)', 'Bloqueado por Trigger/RLS, org mantida', b12Err ? `Erro: ${b12Err.message}` : `Org permanece: ${checkAlphaOrgAfterB12?.organization_id}`, b12Pass);

  // Teste B13 — Troca de meeting_id (Alpha tenta inserir participante em reunião de Beta)
  const { data: b13Data, error: b13Err } = await clientAlphaOwner
    .from('meeting_participants')
    .insert({
      organization_id: betaOrgId,
      meeting_id: betaMeetingId,
      name: 'Intruso Alpha',
    })
    .select();
  const b13Pass = !!b13Err || b13Data?.length === 0;
  recordResult('B13', 'Troca de meeting_id (Alpha tenta inserir participante em reunião de Beta)', 'Rejeitado por RLS (código 42501)', b13Err ? `Erro: ${b13Err.message}` : `${b13Data?.length ?? 0} linhas`, b13Pass);

  // Teste B14 — Troca de identificadores nas rotas (Acesso direto a reuniões cruzadas)
  // Simulado via cliente PostgREST como na API Next.js
  const { data: b14Data } = await clientAlphaOwner.from('meetings').select('id, title, organization_id').eq('id', betaMeetingId).maybeSingle();
  const b14Pass = b14Data === null;
  recordResult('B14', 'Troca de identificadores em rotas/APIs (Alpha busca reunião de Beta pelo ID exato)', 'Retorna null (404 Not Found no backend)', `Resultado: ${JSON.stringify(b14Data)}`, b14Pass);

  // Teste B15 — Tentativa de auto-associação indevida (External User tenta adicionar-se como member em Alpha)
  const { data: b15Data, error: b15Err } = await clientExternal
    .from('organization_members')
    .insert({
      organization_id: alphaOrgId,
      user_id: externalUser.id,
      role: 'member',
      status: 'active',
    })
    .select();
  const b15Pass = !!b15Err || b15Data?.length === 0;
  recordResult('B15', 'Tentativa de auto-associação indevida (External User tenta entrar em Alpha sem convite)', 'Rejeitado por RLS (código 42501)', b15Err ? `Erro: ${b15Err.message}` : `${b15Data?.length ?? 0} linhas`, b15Pass);

  // Teste B16 — Manipulação de papéis (Alpha Member tenta promover-se a Owner de Alpha)
  const { data: b16Data, error: b16Err } = await clientAlphaMember
    .from('organization_members')
    .update({ role: 'owner' })
    .eq('organization_id', alphaOrgId)
    .eq('user_id', alphaMember.id)
    .select();
  // Verificar se o role continua sendo 'member'
  const { data: checkMemberRole } = await clientAlphaOwner
    .from('organization_members')
    .select('role')
    .eq('organization_id', alphaOrgId)
    .eq('user_id', alphaMember.id)
    .single();
  const b16Pass = (b16Data?.length === 0 || !!b16Err) && checkMemberRole?.role === 'member';
  recordResult('B16', 'Manipulação de papéis (Alpha Member tenta promover-se a Owner)', 'Bloqueado por RLS, role permanece "member"', `Afetados: ${b16Data?.length ?? 0}, Role: "${checkMemberRole?.role}"`, b16Pass);

  // Guardar evidências
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n==============================================================================');
  console.log(`FASE B — RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS (${failedTests === 0 ? '100% PASS 🎉' : 'FAIL ❌'})`);
  console.log('==============================================================================');

  const evidence = {
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    failedTests,
    status: failedTests === 0 ? 'PASS' : 'FAIL',
    resources: {
      alphaOrgId,
      betaOrgId,
      alphaMeetingId,
      betaMeetingId,
    },
    results,
  };

  const evidenceFilePath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-phase-b-results.json');
  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidence, null, 2), 'utf-8');
  console.log(`Relatório JSON gravado em: ${evidenceFilePath}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMultiTenantIsolation().catch((err) => {
  console.error('\n❌ Erro durante a execução da Fase B:', err);
  process.exit(1);
});
