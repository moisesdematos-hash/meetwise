import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.C.2');
console.log('VERIFICAÇÃO DE RECONCILIAÇÃO DE DADOS SINTÉTICOS');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function verifyReconciliation() {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const alphaOrgId = manifest.organizations.alpha.id;
  const { alphaOwner } = manifest.users;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: s, error: errAuth } = await client.auth.signInWithPassword({
    email: alphaOwner.email,
    password: alphaOwner.password,
  });
  if (errAuth || !s?.session) {
    throw new Error(`Falha ao autenticar Alpha Owner: ${errAuth?.message}`);
  }

  const authAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
    auth: { persistSession: false },
  });

  // 1. Verificar Faturas da Org Alpha
  console.log('1. Verificando faturas reconciliadas...');
  const { data: invoices, error: errInv } = await authAlpha
    .from('invoices')
    .select('id, invoice_number, status, total_cents, payment_reference, paid_at')
    .eq('organization_id', alphaOrgId)
    .like('invoice_number', 'INV-D1A-%');

  if (errInv) {
    throw new Error(`Erro ao consultar faturas: ${errInv.message}`);
  }

  console.log(`   - Faturas encontradas: ${invoices?.length || 0}`);
  let invoicesOk = true;
  for (const inv of invoices || []) {
    const isOk = inv.status === 'issued' && inv.total_cents === 1900 && inv.payment_reference === null;
    console.log(`     * ${inv.invoice_number}: Status=${inv.status}, Total=${inv.total_cents}, Ref=${inv.payment_reference} -> ${isOk ? 'RECONCILIADA ✅' : 'PENDENTE ❌'}`);
    if (!isOk) invoicesOk = false;
  }

  // 2. Verificar Subscrição
  console.log('\n2. Verificando subscrição da Org Alpha...');
  const { data: subs, error: errSub } = await authAlpha
    .from('subscriptions')
    .select('id, plan_id, status, current_period_end, cancel_at_period_end')
    .eq('organization_id', alphaOrgId);

  const { data: plans } = await authAlpha.from('plans').select('id, code');
  const freePlan = plans?.find(p => p.code === 'free');

  const sub = subs?.[0];
  const isSubOk = sub && sub.plan_id === freePlan?.id && sub.status === 'active' && sub.cancel_at_period_end === false;
  console.log(`   - Subscrição ID: ${sub?.id}`);
  console.log(`   - Plano ID: ${sub?.plan_id} (Esperado Free: ${freePlan?.id})`);
  console.log(`   - Status: ${sub?.status}, CancelAtEnd: ${sub?.cancel_at_period_end}`);
  console.log(`   - Subscrição Reconciliada: ${isSubOk ? 'PASS ✅' : 'PENDENTE ❌'}`);

  // 3. Verificar Audit Log Compensatório
  console.log('\n3. Verificando registo compensatório de auditoria...');
  const { data: logs, error: errLogs } = await authAlpha
    .from('audit_logs')
    .select('id, action, resource_type, created_at, metadata')
    .eq('organization_id', alphaOrgId)
    .eq('action', 'security.reconciliation_applied');

  const compLog = logs?.[0];
  const isLogOk = !!compLog;
  console.log(`   - Registo compensatório encontrado: ${isLogOk ? 'SIM ✅ (ID: ' + compLog.id + ')' : 'NÃO ❌'}`);

  const allReconciled = invoicesOk && isSubOk && isLogOk;
  console.log('\n==============================================================================');
  console.log(`ESTADO DA RECONCILIAÇÃO: ${allReconciled ? 'RECONCILIADO COM SUCESSO ✅' : 'AGUARDA EXECUÇÃO SQL'}`);
  console.log('==============================================================================\n');

  return { invoicesOk, isSubOk, isLogOk, allReconciled };
}

verifyReconciliation().catch(err => {
  console.error('\n❌ ERRO NA VERIFICAÇÃO DE RECONCILIAÇÃO:', err);
  process.exit(1);
});
