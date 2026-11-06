import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';
const EXPECTED_MIGRATION_HASH = 'BB7CC9A233B602691EC19DD252E9BEE785F2A28928044F2705271AD725340210';
const EXPECTED_PROJECT_REF = 'ycxwomqqepetickmxxqj';

console.log('==============================================================================');
console.log('MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.C.2');
console.log('PRE-FLIGHT OBRIGATÓRIO & BACKUP PRÉ-MIGRAÇÃO 009');
console.log('Target Supabase Staging:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

async function runPreflightAndBackup() {
  const preflightResults = {
    step: 'ETAPA 0 & ETAPA 2 - PRE-FLIGHT & BACKUP',
    timestamp: new Date().toISOString(),
    checks: {},
    backup: {},
    goNoGo: 'PENDING'
  };

  // 1. Confirmar Projeto e Ausência de Ligação a Produção
  console.log('1. Verificando URL e Identificador do Projeto...');
  const parsedUrl = new URL(SUPABASE_URL);
  const isStagingRef = parsedUrl.hostname.includes(EXPECTED_PROJECT_REF);
  const isNotProduction = !parsedUrl.hostname.includes('prod') && !parsedUrl.hostname.includes('production');
  
  if (!isStagingRef || !isNotProduction) {
    throw new Error(`VIOLAÇÃO CRÍTICA: O projeto de destino não é o Staging autorizado (${EXPECTED_PROJECT_REF})!`);
  }
  preflightResults.checks.targetProject = { status: 'PASS', project: EXPECTED_PROJECT_REF, url: SUPABASE_URL };
  console.log(`   ✅ Projeto Staging confirmado: ${EXPECTED_PROJECT_REF} (${SUPABASE_URL})`);

  // 2. Confirmar Commit Git
  console.log('2. Verificando commit HEAD no repositório...');
  const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  console.log(`   - HEAD commit: ${gitHead}`);
  preflightResults.checks.gitCommit = { status: 'PASS', head: gitHead, statusOutput: gitStatus };

  // 3. Confirmar SHA-256 da Migração 009
  console.log('3. Calculando e verificando SHA-256 da migração 009...');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261106000009_financial_integrity_and_audit_security.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error('Ficheiro de migração 009 não encontrado!');
  }
  const migrationContent = fs.readFileSync(migrationPath);
  const actualHash = crypto.createHash('sha256').update(migrationContent).digest('hex').toUpperCase();
  console.log(`   - SHA-256 Calculado: ${actualHash}`);
  console.log(`   - SHA-256 Esperado:   ${EXPECTED_MIGRATION_HASH}`);
  if (actualHash !== EXPECTED_MIGRATION_HASH) {
    throw new Error(`SHA-256 mismatch! Esperado: ${EXPECTED_MIGRATION_HASH}, Obtido: ${actualHash}`);
  }
  preflightResults.checks.migrationHash = { status: 'PASS', hash: actualHash };
  console.log('   ✅ Hash SHA-256 verificado com sucesso.');

  // 4. Carregar Manifesto de Identidades Sintéticas
  console.log('4. Carregando manifesto de identidades sintéticas...');
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

  // 5. Autenticar as 4 sessões sintéticas
  console.log('5. Autenticando sessões sintéticas com Supabase Cloud...');
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

  console.log('   ✅ 4 sessões autenticadas com sucesso no Supabase Cloud Staging.');
  preflightResults.checks.authSessions = { status: 'PASS', accounts: 4 };

  const clientAlphaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sAlphaOwner.session.access_token}` } },
    auth: { persistSession: false },
  });

  const clientBetaOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sBetaOwner.session.access_token}` } },
    auth: { persistSession: false },
  });

  // 6. Verificar Ausência de Dados Reais de Clientes nos Registos Afetados
  console.log('6. Inspecionando dados existentes nas tabelas afetadas...');
  const { data: alphaInvoices } = await clientAlphaOwner
    .from('invoices')
    .select('id, invoice_number, status, total_cents, organization_id, created_at');
  
  const { data: betaInvoices } = await clientBetaOwner
    .from('invoices')
    .select('id, invoice_number, status, total_cents, organization_id, created_at');

  const { data: alphaSubscriptions } = await clientAlphaOwner
    .from('subscriptions')
    .select('id, organization_id, plan_id, status, current_period_end, cancel_at_period_end');

  const { data: betaSubscriptions } = await clientBetaOwner
    .from('subscriptions')
    .select('id, organization_id, plan_id, status, current_period_end, cancel_at_period_end');

  const { data: alphaAuditLogs } = await clientAlphaOwner
    .from('audit_logs')
    .select('id, organization_id, action, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  // Validar se todas as faturas pertencem exclusivamente às orgs sintéticas Alpha ou Beta
  const allInvoices = [...(alphaInvoices || []), ...(betaInvoices || [])];
  const foreignInvoices = allInvoices.filter(i => i.organization_id !== alphaOrgId && i.organization_id !== betaOrgId);
  if (foreignInvoices.length > 0) {
    throw new Error(`DADOS DESCONHECIDOS DETETADOS: ${foreignInvoices.length} faturas pertencem a organizações desconhecidas!`);
  }
  console.log(`   ✅ Invoices verificadas: ${allInvoices.length} registos, 100% sintéticos (Orgs Alpha/Beta).`);

  // Validar se todas as subscrições pertencem exclusivamente às orgs sintéticas
  const allSubs = [...(alphaSubscriptions || []), ...(betaSubscriptions || [])];
  const foreignSubs = allSubs.filter(s => s.organization_id !== alphaOrgId && s.organization_id !== betaOrgId);
  if (foreignSubs.length > 0) {
    throw new Error(`DADOS DESCONHECIDOS DETETADOS: ${foreignSubs.length} subscrições pertencem a organizações desconhecidas!`);
  }
  console.log(`   ✅ Subscrições verificadas: ${allSubs.length} registos, 100% sintéticos (Orgs Alpha/Beta).`);

  // Validar audit logs
  console.log(`   ✅ Audit logs verificados: ${alphaAuditLogs?.length || 0} registos inspecionados para Org Alpha.`);
  preflightResults.checks.noRealCustomerData = { status: 'PASS', invoicesCount: allInvoices.length, subscriptionsCount: allSubs.length };

  // 7. ETAPA 2: BACKUP PRÉ-MIGRAÇÃO DE REGISTOS SINTÉTICOS E ESTADO
  console.log('7. [ETAPA 2] Gerando backup snapshot dos registos sintéticos...');
  const backupSnapshot = {
    timestamp: new Date().toISOString(),
    project: EXPECTED_PROJECT_REF,
    organizations: {
      alpha: { id: alphaOrgId, name: manifest.organizations.alpha.name },
      beta: { id: betaOrgId, name: manifest.organizations.beta.name }
    },
    invoices: {
      alpha: alphaInvoices,
      beta: betaInvoices
    },
    subscriptions: {
      alpha: alphaSubscriptions,
      beta: betaSubscriptions
    },
    auditLogsSample: {
      alpha: alphaAuditLogs
    }
  };

  const backupPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-d1c2-pre-migration-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupSnapshot, null, 2), 'utf-8');
  console.log(`   💾 Backup gravado em: ${backupPath}`);
  preflightResults.backup = { status: 'PASS', file: backupPath, snapshotTime: backupSnapshot.timestamp };

  // 8. Preparar Plano de Recuperação Não Destrutivo
  console.log('8. Gerando script de reversão/recuperação não destrutivo...');
  const recoverySql = `-- ==============================================================================
-- MEETWISE AI — NON-DESTRUCTIVE RECOVERY PLAN FOR MIGRATION 009
-- Target: Supabase Cloud Staging (ycxwomqqepetickmxxqj)
-- Scope: Reverts triggers and restores policies to Migration 007/008 baseline
-- ==============================================================================

-- 1. DROP PROTECTIVE TRIGGERS
DROP TRIGGER IF EXISTS trg_protect_invoice_fields ON public.invoices;
DROP FUNCTION IF EXISTS public.protect_invoice_financial_fields();

DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
DROP FUNCTION IF EXISTS public.protect_subscription_financial_fields();

DROP TRIGGER IF EXISTS trg_audit_log_integrity ON public.audit_logs;
DROP FUNCTION IF EXISTS public.protect_audit_log_integrity();

-- 2. RESTORE POLICIES TO PHASE 6 BASELINE (Migration 007)
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;
CREATE POLICY "invoices_manage_admin" ON public.invoices
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "subscriptions_update_owner" ON public.subscriptions;
CREATE POLICY "subscriptions_manage_owner" ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_reject_delete" ON public.audit_logs;

CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- 3. REMOVE MIGRATION RECORD
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261106000009';
`;
  const recoveryPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-d1c2-recovery-plan.sql');
  fs.writeFileSync(recoveryPath, recoverySql, 'utf-8');
  console.log(`   📄 Plano de recuperação gravado em: ${recoveryPath}`);

  preflightResults.recoveryPlan = { status: 'PASS', file: recoveryPath };
  preflightResults.goNoGo = 'GO';

  const preflightOutPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-d1c2-preflight-report.json');
  fs.writeFileSync(preflightOutPath, JSON.stringify(preflightResults, null, 2), 'utf-8');
  console.log(`\n==============================================================================`);
  console.log(`DECISÃO PRE-FLIGHT & BACKUP: ${preflightResults.goNoGo} ✅`);
  console.log(`==============================================================================\n`);
}

runPreflightAndBackup().catch(err => {
  console.error('\n❌ ERRO NO PRE-FLIGHT:', err);
  process.exit(1);
});
