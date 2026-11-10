import { createClient } from '@supabase/supabase-js';

const ADMIN_LOGIN_DOMAIN = 'accounts.my-diets.test';
const login = (process.env.ADMIN_INITIAL_LOGIN ?? 'admin').trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD ?? 'admin123';
const loginPattern = /^[a-z0-9._-]{3,32}$/;

function requiredEnvironmentValue(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function describeApiError(error) {
  const details = [];
  if (error?.status) details.push(`HTTP ${error.status}`);
  if (error?.code) details.push(`code: ${error.code}`);
  if (error?.message) details.push(error.message);
  return details.length ? details.join(' — ') : 'No additional error details were returned.';
}

async function findUserByEmail(client, email) {
  for (let page = 1; ; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error || !Array.isArray(result.data?.users)) {
      throw new Error('Unable to verify whether the bootstrap account already exists.');
    }
    const user = result.data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (result.data.users.length < 1000) return null;
  }
}

async function main() {
  if (!loginPattern.test(login)) {
    throw new Error('ADMIN_INITIAL_LOGIN must contain 3 to 32 letters, numbers, dots, hyphens, or underscores.');
  }
  if (password.length < 6 || password.length > 128) {
    throw new Error('ADMIN_INITIAL_PASSWORD must contain 6 to 128 characters.');
  }

  const client = createClient(
    requiredEnvironmentValue('SUPABASE_URL'),
    requiredEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const email = `${login}@${ADMIN_LOGIN_DOMAIN}`;
  let user;
  let createdUser = false;
  const createResult = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Administrador' },
  });
  if (!createResult.error) {
    user = createResult.data?.user;
    createdUser = true;
  } else if (
    createResult.error.status === 409 ||
    createResult.error.code === 'user_already_exists' ||
    createResult.error.code === 'email_exists'
  ) {
    user = await findUserByEmail(client, email);
  } else {
    throw new Error(
      `Unable to create the initial administrator Auth account. ${describeApiError(createResult.error)}`,
    );
  }

  if (!user?.id) {
    throw new Error('The initial administrator Auth account could not be confirmed.');
  }

  const existingProfile = await client
    .from('profiles')
    .select('id, role, admin_login')
    .eq('id', user.id)
    .maybeSingle();
  if (existingProfile.error) {
    throw new Error(
      `Unable to verify the initial administrator profile. ${describeApiError(existingProfile.error)}`,
    );
  }
  if (existingProfile.data) {
    if (
      existingProfile.data.role === 'SUPERADMIN' &&
      existingProfile.data.admin_login === login
    ) {
      console.log('The initial administrator is already provisioned; no credentials were changed.');
      return;
    }
    throw new Error('The bootstrap Auth user already has a different application profile.');
  }

  const profileResult = await client.from('profiles').insert({
    id: user.id,
    full_name: 'Administrador',
    role: 'SUPERADMIN',
    admin_login: login,
    must_change_password: true,
    is_active: true,
  });
  if (profileResult.error) {
    if (createdUser) {
      const cleanup = await client.auth.admin.deleteUser(user.id);
      if (cleanup.error) {
        throw new Error('Profile setup failed and the new Auth user could not be removed.');
      }
    }
    throw new Error(
      `Unable to create the initial administrator profile. ${describeApiError(profileResult.error)}`,
    );
  }

  console.log(`Administrator provisioned. Login: ${login}. Change the temporary password on first sign-in.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
