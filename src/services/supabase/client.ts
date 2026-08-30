import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

import { env } from '@/config/env';

import type { Database } from './database.types';
import { secureSessionStorage } from './sessionStorage';

/**
 * The one Supabase client.
 *
 * Typed with the generated `Database`, so a column rename breaks `tsc` rather
 * than production. CI regenerates the types and fails if they differ from the
 * committed file, which keeps that guarantee honest.
 *
 * The anon key is shipped in the bundle by design. It grants nothing on its
 * own: Row Level Security decides what each JWT may read, and every table
 * defaults to deny. The key that must never appear here is `service_role`,
 * which bypasses RLS entirely and lives only in edge-function secrets.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      // Keychain, not AsyncStorage. See sessionStorage.ts for why.
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL to parse a callback out of; leaving this on
      // makes the client inspect a location that does not exist.
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'fit' },
    },
  },
);

/** Convenience aliases so features do not import generated paths directly. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Insertable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Updatable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
