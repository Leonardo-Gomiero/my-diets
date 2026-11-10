import { createClient } from '@supabase/supabase-js';

let supabaseClient;

export function createBrowserSupabaseClient(
  {
    url = import.meta.env.VITE_SUPABASE_URL,
    anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
    clientFactory = createClient,
  } = {},
) {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  return clientFactory(url, anonKey);
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createBrowserSupabaseClient();
  }

  return supabaseClient;
}
