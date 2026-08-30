import { z } from 'zod';

/**
 * Environment configuration, validated once at module load.
 *
 * Two rules this file exists to enforce:
 *
 *  1. Nothing else in src/ reads process.env directly (an ESLint rule blocks
 *     it). Config arrives here, gets validated, and leaves as a typed object.
 *
 *  2. Only EXPO_PUBLIC_* values may appear on the client. That prefix means
 *     "compiled into the bundle and readable by anyone who downloads the app".
 *     Vendor API keys live in Supabase Edge Function secrets instead.
 *
 * Failing fast at startup on missing config beats a null-reference three
 * screens deep, where the real cause is invisible.
 */
const EnvSchema = z.object({
  supabaseUrl: z.string().url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(1, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is required'),
  sentryDsn: z.string().url().optional().or(z.literal('')),
  appEnv: z.enum(['development', 'preview', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
      'Copy .env.example to .env and fill in the values, then restart the dev server.',
  );
}

export const env: Env = parsed.data;

export const isProduction = env.appEnv === 'production';
export const isDevelopment = env.appEnv === 'development';
