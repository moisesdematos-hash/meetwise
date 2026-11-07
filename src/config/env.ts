import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('https://mock-project.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default('mock-anon-key-for-local-testing'),
});

const serverEnvSchema = clientEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('mock-service-role-key-for-local-testing'),
  SUPABASE_DB_URL: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  GLADIA_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MEETWISE_STORAGE_BUCKET_RECORDINGS: z.string().default('meeting_recordings'),
  MEETWISE_STORAGE_BUCKET_DOCS: z.string().default('meeting_documents'),
  MEETWISE_WEBHOOK_SECRET: z.string().min(16).default('development-webhook-secret-min-32-chars-long'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  MAX_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let validatedServerEnv: ServerEnv | null = null;
let validatedClientEnv: ClientEnv | null = null;

export function getClientEnv(): ClientEnv {
  if (!validatedClientEnv) {
    const result = clientEnvSchema.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

    if (!result.success) {
      console.error('Invalid client environment variables:', result.error.format());
      throw new Error('Invalid client environment variables');
    }
    validatedClientEnv = result.data;
  }
  return validatedClientEnv;
}

export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('FATAL: Attempted to access getServerEnv() on the client side!');
  }

  if (!validatedServerEnv) {
    const result = serverEnvSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid server environment variables:', result.error.format());
      throw new Error('Invalid server environment variables');
    }
    validatedServerEnv = result.data;
  }
  return validatedServerEnv;
}
