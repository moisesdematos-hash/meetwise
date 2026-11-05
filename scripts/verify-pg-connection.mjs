import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Parse .env.local safely without printing secrets
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL;

  if (!dbUrl) {
    console.log(JSON.stringify({
      status: 'PENDING_CONFIG',
      message: 'SUPABASE_DB_URL is not set in .env.local or environment.',
      details: {
        hostConfigured: false,
        connected: false
      }
    }, null, 2));
    process.exit(0);
  }

  // Parse connection URL components for sanitized display
  let sanitizedHost = 'unknown';
  let sanitizedPort = '5432';
  try {
    const parsed = new URL(dbUrl);
    sanitizedHost = parsed.hostname;
    sanitizedPort = parsed.port || '5432';
  } catch {}

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }, // Required for Supabase Cloud connections
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    
    // 1. Current Database and User
    const infoRes = await client.query('SELECT current_database(), current_user, version();');
    const dbInfo = infoRes.rows[0];

    // 2. Tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    // 3. Supabase migration history if present
    let migrationCount = 0;
    try {
      const migRes = await client.query(`
        SELECT count(*) 
        FROM supabase_migrations.schema_migrations;
      `);
      migrationCount = parseInt(migRes.rows[0].count, 10);
    } catch {
      // Schema migrations table does not exist yet (clean database)
      migrationCount = 0;
    }

    console.log(JSON.stringify({
      status: 'CONNECTED',
      database: dbInfo.current_database,
      currentUser: dbInfo.current_user,
      postgresVersion: dbInfo.version.split(' ')[0] + ' ' + dbInfo.version.split(' ')[1],
      host: sanitizedHost,
      port: sanitizedPort,
      publicTablesCount: tablesRes.rows.length,
      publicTables: tablesRes.rows.map(r => r.table_name),
      migrationHistoryCount: migrationCount,
      hasCustomerData: tablesRes.rows.length > 0
    }, null, 2));

    await client.end();
  } catch (err) {
    console.error(JSON.stringify({
      status: 'CONNECTION_FAILED',
      host: sanitizedHost,
      port: sanitizedPort,
      error: err.message,
    }, null, 2));
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main();
