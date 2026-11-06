import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2: FASE A (PREPARAÇÃO E IDENTIDADE)');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function main() {
  const timestamp = Date.now();
  const password = `MeetWiseSynth_${timestamp}!Pass2026`;

  const accounts = {
    alphaOwner: {
      email: `synth_alpha_owner_${timestamp}@meetwise.ai`,
      fullName: `Alpha Owner Synth ${timestamp}`,
      role: 'owner',
    },
    alphaMember: {
      email: `synth_alpha_member_${timestamp}@meetwise.ai`,
      fullName: `Alpha Member Synth ${timestamp}`,
      role: 'member',
    },
    betaOwner: {
      email: `synth_beta_owner_${timestamp}@meetwise.ai`,
      fullName: `Beta Owner Synth ${timestamp}`,
      role: 'owner',
    },
    externalUser: {
      email: `synth_external_user_${timestamp}@meetwise.ai`,
      fullName: `External User Synth ${timestamp}`,
      role: 'none',
    },
  };

  // Helper para criar cliente Supabase com sessão isolada
  function makeClient() {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  // 1. Criar e autenticar Utilizador Alpha Owner
  console.log('1. Registando Utilizador Alpha Owner...');
  const clientAlphaOwner = makeClient();
  const regAlphaOwner = await clientAlphaOwner.auth.signUp({
    email: accounts.alphaOwner.email,
    password,
    options: { data: { full_name: accounts.alphaOwner.fullName } },
  });
  if (regAlphaOwner.error || !regAlphaOwner.data.user) {
    throw new Error(`Falha ao registar Alpha Owner: ${regAlphaOwner.error?.message}`);
  }
  const alphaOwnerUser = regAlphaOwner.data.user;
  const alphaOwnerToken = regAlphaOwner.data.session?.access_token;
  console.log(`   - Alpha Owner criado: ID=${alphaOwnerUser.id}, Email=${accounts.alphaOwner.email}`);

  // 2. Criar e autenticar Utilizador Alpha Member
  console.log('\n2. Registando Utilizador Alpha Member...');
  const clientAlphaMember = makeClient();
  const regAlphaMember = await clientAlphaMember.auth.signUp({
    email: accounts.alphaMember.email,
    password,
    options: { data: { full_name: accounts.alphaMember.fullName } },
  });
  if (regAlphaMember.error || !regAlphaMember.data.user) {
    throw new Error(`Falha ao registar Alpha Member: ${regAlphaMember.error?.message}`);
  }
  const alphaMemberUser = regAlphaMember.data.user;
  const alphaMemberToken = regAlphaMember.data.session?.access_token;
  console.log(`   - Alpha Member criado: ID=${alphaMemberUser.id}, Email=${accounts.alphaMember.email}`);

  // 3. Criar e autenticar Utilizador Beta Owner
  console.log('\n3. Registando Utilizador Beta Owner...');
  const clientBetaOwner = makeClient();
  const regBetaOwner = await clientBetaOwner.auth.signUp({
    email: accounts.betaOwner.email,
    password,
    options: { data: { full_name: accounts.betaOwner.fullName } },
  });
  if (regBetaOwner.error || !regBetaOwner.data.user) {
    throw new Error(`Falha ao registar Beta Owner: ${regBetaOwner.error?.message}`);
  }
  const betaOwnerUser = regBetaOwner.data.user;
  const betaOwnerToken = regBetaOwner.data.session?.access_token;
  console.log(`   - Beta Owner criado: ID=${betaOwnerUser.id}, Email=${accounts.betaOwner.email}`);

  // 4. Criar e autenticar Utilizador Externo
  console.log('\n4. Registando Utilizador Externo (Sem Organização)...');
  const clientExternal = makeClient();
  const regExternal = await clientExternal.auth.signUp({
    email: accounts.externalUser.email,
    password,
    options: { data: { full_name: accounts.externalUser.fullName } },
  });
  if (regExternal.error || !regExternal.data.user) {
    throw new Error(`Falha ao registar External User: ${regExternal.error?.message}`);
  }
  const externalUser = regExternal.data.user;
  const externalToken = regExternal.data.session?.access_token;
  console.log(`   - External User criado: ID=${externalUser.id}, Email=${accounts.externalUser.email}`);

  // 5. Autenticar clientes autenticados para operações de dados
  const authedAlphaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${alphaOwnerToken}` } },
    auth: { persistSession: false },
  });

  const authedBetaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${betaOwnerToken}` } },
    auth: { persistSession: false },
  });

  const authedAlphaMember = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${alphaMemberToken}` } },
    auth: { persistSession: false },
  });

  const authedExternal = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${externalToken}` } },
    auth: { persistSession: false },
  });

  // 6. Criar Organização Alpha (através da sessão de Alpha Owner)
  console.log('\n5. Criando Organização Alpha via sessão autenticada de Alpha Owner...');
  const orgAlphaName = `Organização Alpha Synth ${timestamp}`;
  const orgAlphaSlug = `synth-alpha-${timestamp}`;
  const { data: alphaOrgRes, error: alphaOrgErr } = await authedAlphaOwner.rpc('create_organization_with_owner', {
    p_name: orgAlphaName,
    p_slug: orgAlphaSlug,
    p_language: 'pt',
    p_full_name: accounts.alphaOwner.fullName,
  });

  let alphaOrgId = alphaOrgRes?.id;
  if (alphaOrgErr || !alphaOrgId) {
    console.log(`   - RPC falhou (${alphaOrgErr?.message}), tentando criação direta como fallback...`);
    const { data: directAlpha, error: directErr } = await authedAlphaOwner
      .from('organizations')
      .insert({
        name: orgAlphaName,
        slug: orgAlphaSlug,
        created_by: alphaOwnerUser.id,
        default_language: 'pt',
      })
      .select('id')
      .single();
    if (directErr || !directAlpha) {
      throw new Error(`Falha ao criar Organização Alpha: ${directErr?.message}`);
    }
    alphaOrgId = directAlpha.id;
    // Inserir associação em organization_members
    await authedAlphaOwner.from('organization_members').insert({
      organization_id: alphaOrgId,
      user_id: alphaOwnerUser.id,
      role: 'owner',
      status: 'active',
    });
  }
  console.log(`   - Organização Alpha criada com sucesso: ID=${alphaOrgId}, Slug=${orgAlphaSlug}`);

  // 7. Associar Alpha Member à Organização Alpha
  console.log('\n6. Associando Alpha Member à Organização Alpha...');
  const { error: addMemberErr } = await authedAlphaOwner
    .from('organization_members')
    .insert({
      organization_id: alphaOrgId,
      user_id: alphaMemberUser.id,
      role: 'member',
      status: 'active',
    });
  if (addMemberErr) {
    throw new Error(`Falha ao associar Alpha Member à Organização Alpha: ${addMemberErr.message}`);
  }
  console.log(`   - Alpha Member associado como 'member' da Organização Alpha.`);

  // 8. Criar Organização Beta (através da sessão de Beta Owner)
  console.log('\n7. Criando Organização Beta via sessão autenticada de Beta Owner...');
  const orgBetaName = `Organização Beta Synth ${timestamp}`;
  const orgBetaSlug = `synth-beta-${timestamp}`;
  const { data: betaOrgRes, error: betaOrgErr } = await authedBetaOwner.rpc('create_organization_with_owner', {
    p_name: orgBetaName,
    p_slug: orgBetaSlug,
    p_language: 'pt',
    p_full_name: accounts.betaOwner.fullName,
  });

  let betaOrgId = betaOrgRes?.id;
  if (betaOrgErr || !betaOrgId) {
    console.log(`   - RPC falhou (${betaOrgErr?.message}), tentando criação direta como fallback...`);
    const { data: directBeta, error: directErr } = await authedBetaOwner
      .from('organizations')
      .insert({
        name: orgBetaName,
        slug: orgBetaSlug,
        created_by: betaOwnerUser.id,
        default_language: 'pt',
      })
      .select('id')
      .single();
    if (directErr || !directBeta) {
      throw new Error(`Falha ao criar Organização Beta: ${directErr?.message}`);
    }
    betaOrgId = directBeta.id;
    await authedBetaOwner.from('organization_members').insert({
      organization_id: betaOrgId,
      user_id: betaOwnerUser.id,
      role: 'owner',
      status: 'active',
    });
  }
  console.log(`   - Organização Beta criada com sucesso: ID=${betaOrgId}, Slug=${orgBetaSlug}`);

  // 9. Validar memberships e isolamento de identidade
  console.log('\n8. Validando estado das identidades sintetizadas...');

  const { data: alphaOwnerMemberships } = await authedAlphaOwner.from('organization_members').select('organization_id, role, status');
  console.log(`   - Alpha Owner memberships: ${JSON.stringify(alphaOwnerMemberships)}`);

  const { data: alphaMemberMemberships } = await authedAlphaMember.from('organization_members').select('organization_id, role, status');
  console.log(`   - Alpha Member memberships: ${JSON.stringify(alphaMemberMemberships)}`);

  const { data: betaOwnerMemberships } = await authedBetaOwner.from('organization_members').select('organization_id, role, status');
  console.log(`   - Beta Owner memberships: ${JSON.stringify(betaOwnerMemberships)}`);

  const { data: externalMemberships } = await authedExternal.from('organization_members').select('organization_id, role, status');
  console.log(`   - External User memberships: ${JSON.stringify(externalMemberships ?? [])} (Esperado: [])`);

  // 10. Registar manifesto de identidades para as Fases subsequentes
  const identitiesManifest = {
    timestamp,
    createdAt: new Date().toISOString(),
    supabaseProject: SUPABASE_URL,
    organizations: {
      alpha: {
        id: alphaOrgId,
        name: orgAlphaName,
        slug: orgAlphaSlug,
      },
      beta: {
        id: betaOrgId,
        name: orgBetaName,
        slug: orgBetaSlug,
      },
    },
    users: {
      alphaOwner: {
        id: alphaOwnerUser.id,
        email: accounts.alphaOwner.email,
        password,
        role: 'owner',
        organizationId: alphaOrgId,
      },
      alphaMember: {
        id: alphaMemberUser.id,
        email: accounts.alphaMember.email,
        password,
        role: 'member',
        organizationId: alphaOrgId,
      },
      betaOwner: {
        id: betaOwnerUser.id,
        email: accounts.betaOwner.email,
        password,
        role: 'owner',
        organizationId: betaOrgId,
      },
      externalUser: {
        id: externalUser.id,
        email: accounts.externalUser.email,
        password,
        role: null,
        organizationId: null,
      },
    },
  };

  const evidenceDir = path.resolve(process.cwd(), 'test-evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const manifestPath = path.join(evidenceDir, 'phase-7-2-gate-2-synthetic-identities.json');
  fs.writeFileSync(manifestPath, JSON.stringify(identitiesManifest, null, 2), 'utf-8');
  console.log(`\n9. Manifesto de identidades sintéticas guardado com sucesso em: ${manifestPath}`);

  console.log('\n==============================================================================');
  console.log('FASE A — PREPARAÇÃO E IDENTIDADE CONCLUÍDA COM SUCESSO! 🎉');
  console.log('==============================================================================');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal durante a Fase A:', err);
  process.exit(1);
});
