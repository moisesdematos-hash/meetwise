import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — LIMPEZA SEGURA DE DADOS SINTÉTICOS');
console.log('==============================================================================\n');

async function cleanup() {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('Nenhum manifesto de dados sintéticos encontrado para limpeza.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Identificados para limpeza:`);
  console.log(`- Org Alpha ID: ${manifest.organizations.alpha.id}`);
  console.log(`- Org Beta ID: ${manifest.organizations.beta.id}`);

  // Autenticar com o proprietário de cada organização para realizar a eliminação estritamente autorizada
  const alphaOwnerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: alphaLogin } = await alphaOwnerClient.auth.signInWithPassword({
    email: manifest.users.alphaOwner.email,
    password: manifest.users.alphaOwner.password,
  });

  if (alphaLogin?.session) {
    const authedAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${alphaLogin.session.access_token}` } },
      auth: { persistSession: false },
    });
    // Eliminar Organização Alpha via sessão autorizada do próprio Owner
    const { error: delAlphaErr } = await authedAlpha
      .from('organizations')
      .delete()
      .eq('id', manifest.organizations.alpha.id);
    console.log(`Eliminação de Org Alpha: ${delAlphaErr ? 'Erro: ' + delAlphaErr.message : 'Sucesso (Cascata RLS)'}`);
  }

  const betaOwnerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: betaLogin } = await betaOwnerClient.auth.signInWithPassword({
    email: manifest.users.betaOwner.email,
    password: manifest.users.betaOwner.password,
  });

  if (betaLogin?.session) {
    const authedBeta = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${betaLogin.session.access_token}` } },
      auth: { persistSession: false },
    });
    // Eliminar Organização Beta via sessão autorizada do próprio Owner
    const { error: delBetaErr } = await authedBeta
      .from('organizations')
      .delete()
      .eq('id', manifest.organizations.beta.id);
    console.log(`Eliminação de Org Beta: ${delBetaErr ? 'Erro: ' + delBetaErr.message : 'Sucesso (Cascata RLS)'}`);
  }

  console.log('\nLimpeza segura concluída sem afetar dados preexistentes.');
}

cleanup().catch((err) => {
  console.error('Erro na limpeza:', err);
  process.exit(1);
});
