import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE A.2: TESTES CLOUD REAIS');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function runCloudTests() {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifesto de identidades sintéticas não encontrado.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const { alphaOwner, alphaMember, betaOwner, externalUser } = manifest.users;

  function makeClient() {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }

  // 1. Obter sessões autenticadas para as contas sintéticas
  console.log('1. Autenticando utilizadores sintéticos no Supabase Cloud...');

  const cAlphaOwner = makeClient();
  const { data: sAlphaOwner, error: eAlphaOwner } = await cAlphaOwner.auth.signInWithPassword({
    email: alphaOwner.email,
    password: alphaOwner.password,
  });
  if (eAlphaOwner || !sAlphaOwner.session) {
    throw new Error(`Falha ao autenticar Alpha Owner: ${eAlphaOwner?.message}`);
  }
  const tokenAlphaOwner = sAlphaOwner.session.access_token;
  console.log(`   - Alpha Owner autenticado com sucesso: ${alphaOwner.email}`);

  const cBetaOwner = makeClient();
  const { data: sBetaOwner, error: eBetaOwner } = await cBetaOwner.auth.signInWithPassword({
    email: betaOwner.email,
    password: betaOwner.password,
  });
  if (eBetaOwner || !sBetaOwner.session) {
    throw new Error(`Falha ao autenticar Beta Owner: ${eBetaOwner?.message}`);
  }
  const tokenBetaOwner = sBetaOwner.session.access_token;
  console.log(`   - Beta Owner autenticado com sucesso: ${betaOwner.email}`);

  const cExternal = makeClient();
  const { data: sExternal, error: eExternal } = await cExternal.auth.signInWithPassword({
    email: externalUser.email,
    password: externalUser.password,
  });
  if (eExternal || !sExternal.session) {
    throw new Error(`Falha ao autenticar External User: ${eExternal?.message}`);
  }
  const tokenExternal = sExternal.session.access_token;
  console.log(`   - External User autenticado com sucesso: ${externalUser.email}`);

  // Clientes autenticados com Bearer JWT próprio
  const authAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenAlphaOwner}` } },
    auth: { persistSession: false },
  });

  const authBeta = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenBetaOwner}` } },
    auth: { persistSession: false },
  });

  const authExt = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${tokenExternal}` } },
    auth: { persistSession: false },
  });

  const anonClient = makeClient();

  // TESTE 1: Criar o perfil do Alpha Owner
  console.log('\n2. [TESTE 1] Criando perfil do Alpha Owner via profiles_insert_self...');
  const { error: insProfileErr } = await authAlpha.from('profiles').upsert({
    id: alphaOwner.id,
    email: alphaOwner.email,
    full_name: 'Alpha Owner Sintético Cloud',
    locale: 'pt',
  });
  console.log(`   - Perfil de Alpha Owner criado: ${insProfileErr ? 'FAIL ❌ (' + insProfileErr.message + ')' : 'PASS ✅'}`);
  if (insProfileErr) throw insProfileErr;

  // TESTE 2: Rejeitar a criação de perfil de outro utilizador
  console.log('\n3. [TESTE 2] Rejeitando criação de perfil de terceiro (Alpha tentando inserir perfil de Beta)...');
  const { error: forgedErr } = await authAlpha.from('profiles').insert({
    id: betaOwner.id,
    email: 'hacked_beta@meetwise.ai',
    full_name: 'Impersonation Attempt',
    locale: 'pt',
  });
  const forgeBlocked = !!forgedErr;
  console.log(`   - Criação de perfil forjado bloqueada por RLS: ${forgeBlocked ? 'PASS ✅ (' + forgedErr?.message + ')' : 'FAIL ❌'}`);
  if (!forgeBlocked) throw new Error('Falha de segurança: Perfil forjado foi aceite!');

  // TESTE 3: Criar a Organização Alpha através da RPC
  console.log('\n4. [TESTE 3] Criando Organização Alpha através da RPC create_organization_with_owner...');
  const alphaSlug = `org-alpha-${Date.now()}`;
  const { data: orgAlphaData, error: orgAlphaErr } = await authAlpha.rpc('create_organization_with_owner', {
    p_name: 'Organização Alpha Staging',
    p_slug: alphaSlug,
    p_language: 'pt',
    p_full_name: 'Alpha Owner Staging',
  });
  console.log(`   - RPC create_organization_with_owner (Alpha): ${orgAlphaErr ? 'FAIL ❌ (' + orgAlphaErr.message + ')' : 'PASS ✅'}`);
  if (orgAlphaErr || !orgAlphaData) throw orgAlphaErr || new Error('Dados nulos na criação da Org Alpha');

  const alphaOrgId = orgAlphaData.id;
  console.log(`   - Organização Alpha ID: ${alphaOrgId}`);

  // TESTE 4: Confirmar created_by válido
  console.log('\n5. [TESTE 4] Confirmando created_by na tabela organizations...');
  const { data: alphaOrgRow } = await authAlpha.from('organizations').select('id, name, created_by').eq('id', alphaOrgId).single();
  const createdByValid = alphaOrgRow?.created_by === alphaOwner.id;
  console.log(`   - created_by corresponde ao Alpha Owner: ${createdByValid ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!createdByValid) throw new Error('created_by não corresponde ao Alpha Owner');

  // TESTE 5: Confirmar associação Owner
  console.log('\n6. [TESTE 5] Confirmando associação Owner em organization_members...');
  const { data: alphaMembers } = await authAlpha.from('organization_members').select('*').eq('organization_id', alphaOrgId);
  const isAlphaOwner = alphaMembers?.some(m => m.user_id === alphaOwner.id && m.role === 'owner');
  console.log(`   - Alpha Owner ativo como owner: ${isAlphaOwner ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!isAlphaOwner) throw new Error('Alpha Owner não associado como owner');

  // TESTE 6: Criar o perfil do Beta Owner
  console.log('\n7. [TESTE 6] Criando perfil do Beta Owner...');
  const { error: insBetaProfileErr } = await authBeta.from('profiles').upsert({
    id: betaOwner.id,
    email: betaOwner.email,
    full_name: 'Beta Owner Sintético Cloud',
    locale: 'pt',
  });
  console.log(`   - Perfil de Beta Owner criado: ${insBetaProfileErr ? 'FAIL ❌ (' + insBetaProfileErr.message + ')' : 'PASS ✅'}`);
  if (insBetaProfileErr) throw insBetaProfileErr;

  // TESTE 7: Criar a Organização Beta através da RPC
  console.log('\n8. [TESTE 7] Criando Organização Beta através da RPC create_organization_with_owner...');
  const betaSlug = `org-beta-${Date.now()}`;
  const { data: orgBetaData, error: orgBetaErr } = await authBeta.rpc('create_organization_with_owner', {
    p_name: 'Organização Beta Staging',
    p_slug: betaSlug,
    p_language: 'pt',
    p_full_name: 'Beta Owner Staging',
  });
  console.log(`   - RPC create_organization_with_owner (Beta): ${orgBetaErr ? 'FAIL ❌ (' + orgBetaErr.message + ')' : 'PASS ✅'}`);
  if (orgBetaErr || !orgBetaData) throw orgBetaErr || new Error('Dados nulos na criação da Org Beta');

  const betaOrgId = orgBetaData.id;
  console.log(`   - Organização Beta ID: ${betaOrgId}`);

  // TESTE 8: Confirmar associação Owner de Beta
  console.log('\n9. [TESTE 8] Confirmando associação Owner de Beta em organization_members...');
  const { data: betaMembers } = await authBeta.from('organization_members').select('*').eq('organization_id', betaOrgId);
  const isBetaOwner = betaMembers?.some(m => m.user_id === betaOwner.id && m.role === 'owner');
  console.log(`   - Beta Owner ativo como owner: ${isBetaOwner ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!isBetaOwner) throw new Error('Beta Owner não associado como owner');

  // TESTE 9: Confirmar que Alpha e Beta são organizações distintas
  console.log('\n10. [TESTE 9] Confirmando distinção estrita entre Organizações Alpha e Beta...');
  const isDistinct = alphaOrgId !== betaOrgId && alphaSlug !== betaSlug;
  console.log(`   - Organizações Alpha e Beta são distintas e independentes: ${isDistinct ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!isDistinct) throw new Error('Alpha e Beta têm identificadores colididentes!');

  // TESTE 10: Confirmar que utilizador externo permanece sem associação
  console.log('\n11. [TESTE 10] Confirmando que utilizador externo permanece sem associação...');
  const { data: extMemberships } = await authExt.from('organization_members').select('*');
  const extOrgsCount = extMemberships?.length ?? 0;
  console.log(`   - Associações do utilizador externo: ${extOrgsCount} (Esperado: 0): ${extOrgsCount === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
  if (extOrgsCount !== 0) throw new Error('Utilizador externo possui associações indevidas!');

  // TESTE 11: Testar rejeição de chamadas anónimas
  console.log('\n12. [TESTE 11] Testando rejeição de chamadas anónimas à RPC...');
  const { data: anonData, error: anonErr } = await anonClient.rpc('create_organization_with_owner', {
    p_name: 'Tentativa Anónima',
    p_slug: 'org-anon-blocked',
  });
  const anonBlocked = !!anonErr && (anonErr.message.includes('UNAUTHORIZED') || anonErr.message.includes('Authentication required') || anonErr.code === '42501');
  console.log(`   - Chamada anónima bloqueada pela RPC: ${anonBlocked ? 'PASS ✅ (' + anonErr?.message + ')' : 'FAIL ❌'}`);
  if (!anonBlocked) throw new Error('Falha de segurança: Chamada anónima à RPC foi permitida!');

  // TESTE 12: Testar rejeição de slug duplicado sem dados parciais
  console.log('\n13. [TESTE 12] Testando rejeição de slug duplicado...');
  const { error: dupSlugErr } = await authAlpha.rpc('create_organization_with_owner', {
    p_name: 'Organização Duplicada',
    p_slug: alphaSlug, // Reutilizando slug da Org Alpha já existente
    p_language: 'pt',
  });
  const dupBlocked = !!dupSlugErr;
  console.log(`   - Criação com slug duplicado rejeitada: ${dupBlocked ? 'PASS ✅ (' + dupSlugErr?.message + ')' : 'FAIL ❌'}`);
  if (!dupBlocked) throw new Error('Falha: Slug duplicado não foi rejeitado!');

  // Atualizar manifesto com as organizações criadas
  manifest.organizations.alpha = { id: alphaOrgId, name: 'Organização Alpha Staging', slug: alphaSlug };
  manifest.organizations.beta = { id: betaOrgId, name: 'Organização Beta Staging', slug: betaSlug };
  manifest.status = 'ORGANIZATIONS_PROVISIONED';
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n==============================================================================');
  console.log('TODOS OS 12 TESTES CLOUD REAIS DA FASE A.2 APROVADOS COM SUCESSO! 🎉');
  console.log('==============================================================================');
}

runCloudTests().catch((err) => {
  console.error('\n❌ Erro durante testes Cloud:', err);
  process.exit(1);
});
