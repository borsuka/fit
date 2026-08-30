/**
 * Environment for tests, set BEFORE any module loads.
 *
 * src/config/env.ts validates configuration at import time and throws when it
 * is missing - which is right for the app and fatal for a test that imports
 * anything in the service layer. `setupFiles` runs before the module registry,
 * so this is the only place it can be fixed.
 *
 * Deliberately obvious placeholders: a test that reaches a real Supabase
 * project is a test that can fail for reasons having nothing to do with the
 * code under test.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-a-real-key';
process.env.EXPO_PUBLIC_APP_ENV = 'development';
