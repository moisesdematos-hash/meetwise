import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.resolve(process.cwd(), 'supabase');
const unifiedContent = fs.readFileSync(path.join(baseDir, 'staging_unified_schema.sql'), 'utf8');

// Split by STEP markers
const parts = unifiedContent.split(/-- STEP \d\/7: MIGRATION \d+ \([^\)]+\)/);
const header = parts[0];

// Step 1, 2, 3 -> Part 1 Foundation
const part1 = header + 
  '-- STEP 1/7: MIGRATION 20261104000001 (initial_schema)' + parts[1] +
  '-- STEP 2/7: MIGRATION 20261104000002 (rls_policies)' + parts[2] +
  '-- STEP 3/7: MIGRATION 20261104000003 (storage_and_indexes)' + parts[3];

// Step 4, 5, 6 -> Part 2 Intelligence & Collaboration
const part2 = 
  '-- ==============================================================================\n' +
  '-- MEETWISE AI — STAGING PART 2: TRANSCRIÇÃO, INTELIGÊNCIA & COLABORAÇÃO\n' +
  '-- ==============================================================================\n\n' +
  '-- STEP 4/7: MIGRATION 20261104000004 (phase_3_transcription)' + parts[4] +
  '-- STEP 5/7: MIGRATION 20261104000005 (phase_4_intelligence)' + parts[5] +
  '-- STEP 6/7: MIGRATION 20261104000006 (phase_5_export_and_collaboration)' + parts[6];

// Step 7 -> Part 3 Monetization
const part3 = 
  '-- ==============================================================================\n' +
  '-- MEETWISE AI — STAGING PART 3: MONETIZAÇÃO, FATURAÇÃO & QUOTAS\n' +
  '-- ==============================================================================\n\n' +
  '-- STEP 7/7: MIGRATION 20261105000007 (phase_6_monetization_and_admin)' + parts[7];

fs.writeFileSync(path.join(baseDir, 'staging_part1_foundation.sql'), part1, 'utf8');
fs.writeFileSync(path.join(baseDir, 'staging_part2_intelligence.sql'), part2, 'utf8');
fs.writeFileSync(path.join(baseDir, 'staging_part3_monetization.sql'), part3, 'utf8');

console.log('Part 1 bytes:', Buffer.byteLength(part1, 'utf8'), 'lines:', part1.split('\n').length);
console.log('Part 2 bytes:', Buffer.byteLength(part2, 'utf8'), 'lines:', part2.split('\n').length);
console.log('Part 3 bytes:', Buffer.byteLength(part3, 'utf8'), 'lines:', part3.split('\n').length);
