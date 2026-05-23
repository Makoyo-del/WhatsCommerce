import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization — avoids build-time crash when env vars aren't set yet.
// Supabase client is created on first use, not at import time.

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// Convenience export — use `supabase` in your route handlers
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
