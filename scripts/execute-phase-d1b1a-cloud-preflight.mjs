/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — D1.B.1-A
 * CLOUD STAGING PRE-FLIGHT (STRICTLY READ-ONLY)
 *
 * - Uses ONLY the public anon key + synthetic identities (no service_role, no DB URL).
 * - Performs ONLY: auth sign-in, SELECT (count/head), OpenAPI GET, and
 *   non-executing RPC signature probes (deliberately invalid parameter names,
 *   which PostgREST rejects during function resolution — nothing is executed).
 * - Writes evidence locally to test-evidence/phase-7-2-gate-2-d1b1a-cloud-preflight.json
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const EXPECTED_REF = 'ycxwomqqepetickmxxqj';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${EXPECTED_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';
const EXPECTED_HASH = '0DCA54A56526B79A2244DC02B145831C458D0C4A4DCAC060C3786BFB6E0B80C3';

const out = { timestamp: new Date().toISOString(), project: EXPECTED_REF, mode: 'READ_ONLY', checks: {} };

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
}

async function main() {
  // 1. Target & integrity
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  if (ref !== EXPECTED_REF) throw new Error(`Unexpected project ref: ${ref}`);
  out.checks.target = { ref, url: SUPABASE_URL };
  out.checks.git = {
    head: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
    porcelain: execSync('git status --porcelain', { encoding: 'utf-8' }).trim(),
  };
  const migDir = path.resolve('supabase/migrations');
  out.checks.migrationHashes = Object.fromEntries(
    fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort().map(f => [f, sha256(path.join(migDir, f))])
  );
  out.checks.migration010HashMatch =
    out.checks.migrationHashes['20261106000010_concurrency_and_quota_atomicity.sql'] === EXPECTED_HASH;

  // 2. Synthetic sessions
  const manifest = JSON.parse(fs.readFileSync('test-evidence/phase-7-2-gate-2-synthetic-identities.json', 'utf-8'));
  const alphaOrgId = manifest.organizations.alpha.id;
  const betaOrgId = manifest.organizations.beta.id;
  const sessions = {};
  for (const key of ['alphaOwner', 'alphaMember', 'betaOwner', 'externalUser']) {
    const u = manifest.users[key];
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error || !data?.session) throw new Error(`Sign-in failed for ${key}: ${error?.message}`);
    sessions[key] = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { persistSession: false },
    });
    sessions[key].__token = data.session.access_token;
  }
  out.checks.sessions = Object.keys(sessions);

  // 3. RPC catalogue via OpenAPI (GET only)
  const rpcTargets = [
    'reserve_organization_quota', 'release_organization_quota', 'settle_organization_quota',
    'get_next_invoice_number', 'current_user_org_ids',
  ];
  const openapi = {};
  for (const [label, token] of [['anon', SUPABASE_ANON_KEY], ['alphaOwner', sessions.alphaOwner.__token]]) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: 'application/openapi+json' },
      });
      const body = r.ok ? await r.json() : null;
      const paths = body?.paths ? Object.keys(body.paths) : [];
      openapi[label] = {
        http: r.status,
        available: !!body?.paths,
        rpcPresence: Object.fromEntries(rpcTargets.map(n => [n, paths.includes(`/rpc/${n}`)])),
      };
    } catch (e) {
      openapi[label] = { error: e.message };
    }
  }
  out.checks.openapi = openapi;

  // 4. Non-executing signature probes (invalid param name => PGRST202, function body never runs)
  const probes = {};
  for (const fn of ['reserve_organization_quota', 'release_organization_quota', 'settle_organization_quota']) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${sessions.externalUser.__token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ __d1b1a_nonexistent_probe_param: 1 }),
    });
    let body = null;
    try { body = await r.json(); } catch { /* ignore */ }
    probes[fn] = { http: r.status, code: body?.code ?? null, hint: body?.hint ?? null, message: body?.message ?? null };
  }
  out.checks.rpcSignatureProbes = probes;

  // 5. Read-only data inventory (counts visible under RLS per tenant)
  const tables = [
    'organizations', 'organization_members', 'profiles', 'meetings', 'media_assets',
    'transcripts', 'transcript_segments', 'processing_jobs', 'subscriptions', 'plans',
    'invoices', 'invoice_lines', 'usage_ledger', 'organization_quota_reserves',
    'financial_ledger_entries', 'audit_logs',
  ];
  const inventory = {};
  for (const who of ['alphaOwner', 'betaOwner', 'externalUser']) {
    inventory[who] = {};
    for (const t of tables) {
      const { count, error } = await sessions[who].from(t).select('*', { count: 'exact', head: true });
      inventory[who][t] = error ? `ERR:${error.code || ''}:${error.message}` : count;
    }
  }
  out.checks.inventory = inventory;

  // 6. FIN-REC-01 current state (read-only)
  const { data: alphaSubs, error: subErr } = await sessions.alphaOwner
    .from('subscriptions')
    .select('id, organization_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at')
    .eq('organization_id', alphaOrgId);
  const { data: plans, error: planErr } = await sessions.alphaOwner.from('plans').select('id, code, name');
  const { data: alphaReserves } = await sessions.alphaOwner
    .from('organization_quota_reserves').select('id, status, reserved_quantity, expires_at').eq('organization_id', alphaOrgId);
  const { data: alphaUsage } = await sessions.alphaOwner
    .from('usage_ledger').select('id, operation, quantity, status, created_at').eq('organization_id', alphaOrgId);
  const { data: alphaInvoices } = await sessions.alphaOwner
    .from('invoices').select('id, invoice_number, status, total_cents, created_at').eq('organization_id', alphaOrgId);
  out.checks.finRec01 = {
    subscriptions: subErr ? `ERR:${subErr.message}` : alphaSubs,
    plans: planErr ? `ERR:${planErr.message}` : plans,
    alphaQuotaReserves: alphaReserves,
    alphaUsageLedger: alphaUsage,
    alphaInvoices,
  };

  // 7. Cross-tenant read isolation spot-check
  const { data: betaSeesAlpha } = await sessions.betaOwner.from('subscriptions').select('id').eq('organization_id', alphaOrgId);
  const { data: extSeesAlphaRes } = await sessions.externalUser.from('organization_quota_reserves').select('id').eq('organization_id', alphaOrgId);
  out.checks.crossTenantRead = {
    betaOwnerSeesAlphaSubscriptions: betaSeesAlpha?.length ?? 0,
    externalSeesAlphaQuotaReserves: extSeesAlphaRes?.length ?? 0,
  };

  out.checks.orgIds = { alphaOrgId, betaOrgId };
  fs.writeFileSync('test-evidence/phase-7-2-gate-2-d1b1a-cloud-preflight.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  out.fatal = e.message;
  fs.writeFileSync('test-evidence/phase-7-2-gate-2-d1b1a-cloud-preflight.json', JSON.stringify(out, null, 2));
  console.error('PREFLIGHT FAILED:', e.message);
  process.exit(1);
});
