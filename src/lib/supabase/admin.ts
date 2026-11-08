import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/config/env';
import type { Database } from './database.types';

/**
 * Checks whether a real (non-mock) SUPABASE_SERVICE_ROLE_KEY is configured in the environment.
 */
export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('mock')
  );
}

/**
 * Service Role Client for background workers, webhooks, and administrative operations.
 * CRITICAL: NEVER import or execute this on the client side.
 */
export function createAdminClient() {
  const env = getServerEnv();
  const effectiveKey = isServiceRoleConfigured()
    ? env.SUPABASE_SERVICE_ROLE_KEY
    : env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    effectiveKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Returns the Service Role client when configured, or falls back to the authenticated
 * user's server Supabase client (enforcing RLS with the user's session JWT).
 */
export function getEffectiveServerClient(
  userClient: SupabaseClient<Database>
): SupabaseClient<Database> {
  return isServiceRoleConfigured() ? createAdminClient() : userClient;
}
