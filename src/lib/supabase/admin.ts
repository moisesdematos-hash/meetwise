import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/config/env';
import type { Database } from './database.types';

/**
 * Service Role Client for background workers, webhooks, and administrative operations.
 * CRITICAL: NEVER import or execute this on the client side.
 */
export function createAdminClient() {
  const env = getServerEnv();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
