import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const EXPECTED_REF = 'ycxwomqqepetickmxxqj';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${EXPECTED_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

async function main() {
  const manifest = JSON.parse(fs.readFileSync('test-evidence/phase-7-2-gate-2-synthetic-identities.json', 'utf-8'));
  const alphaOrgId = manifest.organizations.alpha.id;
  const betaOrgId = manifest.organizations.beta.id;

  const cAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sAlpha, error: errAlpha } = await cAlpha.auth.signInWithPassword({
    email: manifest.users.alphaOwner.email,
    password: manifest.users.alphaOwner.password,
  });
  if (errAlpha) throw new Error(`Alpha Owner auth failed: ${errAlpha.message}`);

  const clientAlpha = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sAlpha.session.access_token}` } },
    auth: { persistSession: false },
  });

  const cBeta = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sBeta, error: errBeta } = await cBeta.auth.signInWithPassword({
    email: manifest.users.betaOwner.email,
    password: manifest.users.betaOwner.password,
  });
  if (errBeta) throw new Error(`Beta Owner auth failed: ${errBeta.message}`);

  const clientBeta = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sBeta.session.access_token}` } },
    auth: { persistSession: false },
  });

  // Pull all financial tables for Alpha
  const { data: alphaSubs } = await clientAlpha.from('subscriptions').select('*').eq('organization_id', alphaOrgId);
  const { data: alphaReserves } = await clientAlpha.from('organization_quota_reserves').select('*').eq('organization_id', alphaOrgId);
  const { data: alphaUsage } = await clientAlpha.from('usage_ledger').select('*').eq('organization_id', alphaOrgId);
  const { data: alphaInvoices } = await clientAlpha.from('invoices').select('*').eq('organization_id', alphaOrgId);
  const { data: alphaLedger } = await clientAlpha.from('financial_ledger_entries').select('*').eq('organization_id', alphaOrgId);
  const { data: alphaAudits } = await clientAlpha.from('audit_logs').select('*').eq('organization_id', alphaOrgId);

  // Pull all financial tables for Beta
  const { data: betaSubs } = await clientBeta.from('subscriptions').select('*').eq('organization_id', betaOrgId);
  const { data: betaReserves } = await clientBeta.from('organization_quota_reserves').select('*').eq('organization_id', betaOrgId);
  const { data: betaUsage } = await clientBeta.from('usage_ledger').select('*').eq('organization_id', betaOrgId);
  const { data: betaInvoices } = await clientBeta.from('invoices').select('*').eq('organization_id', betaOrgId);

  const snapshot = {
    timestamp: new Date().toISOString(),
    project: EXPECTED_REF,
    mode: 'PRE_RECONCILIATION_FINANCIAL_SNAPSHOT',
    alphaOrgId,
    betaOrgId,
    alpha: {
      subscriptions: alphaSubs,
      quotaReserves: alphaReserves,
      usageLedger: alphaUsage,
      invoices: alphaInvoices,
      financialLedgerEntries: alphaLedger,
      auditLogs: alphaAudits,
    },
    beta: {
      subscriptions: betaSubs,
      quotaReserves: betaReserves,
      usageLedger: betaUsage,
      invoices: betaInvoices,
    },
  };

  const outPath = path.resolve('test-evidence/phase-7-2-gate-2-d1b1c-pre-reconciliation-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`Financial Snapshot saved to: ${outPath}`);
  console.log('Alpha Subscriptions:', JSON.stringify(alphaSubs, null, 2));
  console.log('Alpha Quota Reserves count:', alphaReserves?.length);
  console.log('Alpha Usage Ledger count:', alphaUsage?.length);
  console.log('Alpha Invoices count:', alphaInvoices?.length);
  console.log('Beta Subscriptions count:', betaSubs?.length);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
