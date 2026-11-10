import { createClient } from '@supabase/supabase-js';

function requiredEnvironmentValue(environment, name) {
  const value = environment[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing server environment variable: ${name}`);
  }

  return value;
}

function createServerClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createTokenVerifierClient(environment = process.env) {
  const url = requiredEnvironmentValue(environment, 'SUPABASE_URL');
  const anonKey = requiredEnvironmentValue(environment, 'SUPABASE_ANON_KEY');

  return createServerClient(url, anonKey);
}

export function createAuthenticatedSupabaseClient(
  accessToken,
  environment = process.env,
) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new Error('A verified access token is required.');
  }

  const url = requiredEnvironmentValue(environment, 'SUPABASE_URL');
  const anonKey = requiredEnvironmentValue(environment, 'SUPABASE_ANON_KEY');

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createServerSupabaseClient(environment = process.env) {
  if (environment.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'The Supabase service role key must not use a VITE_ environment variable.',
    );
  }

  const url = requiredEnvironmentValue(environment, 'SUPABASE_URL');
  const serviceRoleKey = requiredEnvironmentValue(
    environment,
    'SUPABASE_SERVICE_ROLE_KEY',
  );

  return createServerClient(url, serviceRoleKey);
}
