import fs from 'node:fs';
import path from 'node:path';

const migrationFiles = [
  '20261104000001_initial_schema.sql',
  '20261104000002_rls_policies.sql',
  '20261104000003_storage_and_indexes.sql',
  '20261104000004_phase_3_transcription.sql',
  '20261104000005_phase_4_intelligence.sql',
  '20261104000006_phase_5_export_and_collaboration.sql',
  '20261105000007_phase_6_monetization_and_admin.sql'
];

console.log('Inspecting 7 migrations...');
const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');

let allPolicies = [];
let allTriggers = [];

for (const file of migrationFiles) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  const policyMatches = [...content.matchAll(/CREATE\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+([\w\.]+)/gi)];
  policyMatches.forEach(m => {
    allPolicies.push({ file, policy: m[1], table: m[2] });
  });

  const triggerMatches = [...content.matchAll(/CREATE\s+TRIGGER\s+(\w+)\s+(?:BEFORE|AFTER)\s+(?:INSERT|UPDATE|DELETE).+?ON\s+([\w\.]+)/gis)];
  triggerMatches.forEach(m => {
    allTriggers.push({ file, trigger: m[1], table: m[2] });
  });
}

console.log(`Found ${allPolicies.length} policies and ${allTriggers.length} triggers across ${migrationFiles.length} migrations.`);
console.log('Sample policies:', allPolicies.slice(0, 5));
console.log('Sample triggers:', allTriggers.slice(0, 5));
