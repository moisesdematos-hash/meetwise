import fs from 'node:fs';
import path from 'node:path';

const migrationFiles = [
  { version: '20261104000001', name: 'initial_schema', file: '20261104000001_initial_schema.sql' },
  { version: '20261104000002', name: 'rls_policies', file: '20261104000002_rls_policies.sql' },
  { version: '20261104000003', name: 'storage_and_indexes', file: '20261104000003_storage_and_indexes.sql' },
  { version: '20261104000004', name: 'phase_3_transcription', file: '20261104000004_phase_3_transcription.sql' },
  { version: '20261104000005', name: 'phase_4_intelligence', file: '20261104000005_phase_4_intelligence.sql' },
  { version: '20261104000006', name: 'phase_5_export_and_collaboration', file: '20261104000006_phase_5_export_and_collaboration.sql' },
  { version: '20261105000007', name: 'phase_6_monetization_and_admin', file: '20261105000007_phase_6_monetization_and_admin.sql' }
];

const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
const outputFile = path.resolve(process.cwd(), 'supabase', 'staging_unified_schema.sql');

function makeIdempotent(sql) {
  let processed = sql;

  // Add DROP POLICY IF EXISTS before CREATE POLICY if not already present immediately before
  processed = processed.replace(
    /((?:DROP\s+POLICY\s+IF\s+EXISTS\s+(?:\"[^\"]+\"|\w+)\s+ON\s+[\w\.]+;\s*)?)(CREATE\s+POLICY\s+(\"[^\"]+\"|\w+)\s+ON\s+([\w\.]+))/gi,
    (match, existingDrop, createStmt, policyName, tableName) => {
      if (existingDrop && existingDrop.trim().length > 0) {
        return match;
      }
      return `DROP POLICY IF EXISTS ${policyName} ON ${tableName};\n${createStmt}`;
    }
  );

  // Add DROP TRIGGER IF EXISTS before CREATE TRIGGER if not already present
  processed = processed.replace(
    /((?:DROP\s+TRIGGER\s+IF\s+EXISTS\s+\w+\s+ON\s+[\w\.]+;\s*)?)(CREATE\s+TRIGGER\s+(\w+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+(?:INSERT|UPDATE|DELETE)(?:[\s\S]*?)ON\s+([\w\.]+))/gi,
    (match, existingDrop, createStmt, triggerName, tableName) => {
      if (existingDrop && existingDrop.trim().length > 0) {
        return match;
      }
      return `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};\n${createStmt}`;
    }
  );

  return processed;
}

let unifiedSql = `-- ==============================================================================
-- MEETWISE AI — UNIFIED STAGING SCHEMA & MIGRATIONS
-- Target Environment: Supabase Cloud Staging (Project: ycxwomqqepetickmxxqj)
-- Description: Consolidated 7 sequential migrations (Phases 1-6)
-- Security: Fully idempotent, non-destructive, with RLS and Anti-Tamper Triggers
-- ==============================================================================

-- 1. SETUP MIGRATION TRACKING SCHEMA & TABLE
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);

`;

for (let i = 0; i < migrationFiles.length; i++) {
  const item = migrationFiles[i];
  const filePath = path.join(migrationsDir, item.file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  unifiedSql += `\n-- ==============================================================================\n`;
  unifiedSql += `-- STEP ${i + 1}/7: MIGRATION ${item.version} (${item.name})\n`;
  unifiedSql += `-- Source: supabase/migrations/${item.file}\n`;
  unifiedSql += `-- ==============================================================================\n\n`;
  
  unifiedSql += makeIdempotent(content);
  unifiedSql += `\n\n-- Record migration ${item.version} in schema_migrations\n`;
  unifiedSql += `INSERT INTO supabase_migrations.schema_migrations (version, name)\n`;
  unifiedSql += `VALUES ('${item.version}', '${item.name}')\n`;
  unifiedSql += `ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;\n\n`;
}

fs.writeFileSync(outputFile, unifiedSql, 'utf8');

console.log(`Successfully generated unified schema at: ${outputFile}`);
console.log(`Total output size: ${Buffer.byteLength(unifiedSql, 'utf8')} bytes, ${unifiedSql.split('\n').length} lines.`);
