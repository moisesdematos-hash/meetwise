import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxwomqqepetickmxxqj.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2E5wIcfZkRgaH7p11vspBw_-WaCniaZ';

console.log('==============================================================================');
console.log('MEETWISE AI — Supabase Cloud Post-Migration Schema Verification');
console.log('Target Project:', SUPABASE_URL);
console.log('Timestamp:', new Date().toISOString());
console.log('==============================================================================\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const EXPECTED_TABLES = [
  // Fase 1: Core Foundation (20 tables)
  'profiles',
  'organizations',
  'organization_members',
  'organization_invitations',
  'meetings',
  'meeting_participants',
  'media_assets',
  'processing_jobs',
  'transcript_segments',
  'meeting_summaries',
  'meeting_minutes',
  'meeting_decisions',
  'meeting_tasks',
  'meeting_documents',
  'plans',
  'subscriptions',
  'usage_ledger',
  'payment_events',
  'ai_provider_requests',
  'audit_logs',

  // Fase 4: Intelligence & Custom Templates (1 table)
  'organization_templates',

  // Fase 5: Export, Versioning & Collaboration (4 tables)
  'organization_document_sequences',
  'meeting_document_versions',
  'meeting_document_comments',
  'meeting_document_shares',

  // Fase 6: Monetization, Invoicing & Quotas (8 tables)
  'plan_prices',
  'checkout_sessions',
  'invoices',
  'invoice_lines',
  'financial_ledger_entries',
  'refunds',
  'platform_admins',
  'organization_quota_reserves'
];

async function runVerification() {
  console.log(`Checking 33 expected public tables via Supabase REST API...\n`);

  let passedCount = 0;
  let missingCount = 0;
  const missingTables = [];

  for (const table of EXPECTED_TABLES) {
    try {
      const { data, count, error, status } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
          console.log(`❌ [MISSING] public.${table} (PGRST205 - Table not found in schema cache)`);
          missingCount++;
          missingTables.push(table);
        } else if (error.message && (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND'))) {
          console.log(`⚠️ [NETWORK ERROR] Could not reach Supabase endpoint (${error.message}). Check connection.`);
          process.exit(1);
        } else {
          // Table exists and PostgREST enforces RLS / returns standard HTTP status (200, 206, 401, 403, 406)
          console.log(`✅ [FOUND & PROTECTED] public.${table} (Status: ${status}, Code: ${error.code || 'RLS'})`);
          passedCount++;
        }
      } else {
        console.log(`✅ [FOUND] public.${table} (Status: ${status}, Rows: ${count ?? 0})`);
        passedCount++;
      }
    } catch (err) {
      console.log(`❌ [ERROR] public.${table}:`, err.message);
      missingCount++;
      missingTables.push(table);
    }
  }

  console.log('\n------------------------------------------------------------------------------');
  console.log(`Summary: ${passedCount}/${EXPECTED_TABLES.length} tables verified.`);

  if (passedCount === EXPECTED_TABLES.length) {
    console.log(`🎉 ALL 33 TABLES ACTIVELY PRESENT IN SUPABASE CLOUD SCHEMA!`);
    
    // Check Plans seed
    console.log('\nChecking seeded plans in public.plans...');
    const { data: plans, error: plansErr } = await supabase
      .from('plans')
      .select('code, name, monthly_minutes_included, price_cents_usd');

    if (plansErr) {
      console.log('⚠️ Could not query plans:', plansErr.message);
    } else {
      console.log(`Found ${plans?.length || 0} plans:`, plans?.map(p => `${p.code} (${p.name})`));
    }

    // Check Plan Prices seed
    console.log('\nChecking seeded prices in public.plan_prices...');
    const { data: prices, error: pricesErr } = await supabase
      .from('plan_prices')
      .select('currency, amount_cents, billing_interval')
      .limit(5);

    if (pricesErr) {
      console.log('⚠️ Could not query plan_prices:', pricesErr.message);
    } else {
      console.log(`Found active prices sample (${prices?.length || 0}):`, prices);
    }

    process.exit(0);
  } else {
    console.log(`\n⚠️ Missing or unmigrated tables (${missingCount}):`, missingTables.join(', '));
    console.log(`Please ensure the migration script was fully executed in the Supabase SQL Editor.`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
