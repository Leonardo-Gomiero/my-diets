import { getSupabaseClient } from './supabaseClient.js';

const VALID_ROLES = new Set(['ADMIN', 'STUDENT']);

function authenticationError() {
  return new Error('Email or password is incorrect.');
}

export async function getApplicationProfile(
  session,
  { fetchImpl = fetch } = {},
) {
  if (!session?.access_token || !session.user?.id) {
    throw new Error('Your session is no longer valid. Please sign in again.');
  }

  let response;
  try {
    response = await fetchImpl('/api/me', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    throw new Error('Unable to verify your account right now. Please try again.');
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    if (
      response.status === 403 &&
      errorBody?.error?.code === 'PASSWORD_CHANGE_REQUIRED'
    ) {
      return { profile: null, mustChangePassword: true };
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your account could not be verified. Please contact support.');
    }

    throw new Error('Unable to verify your account right now. Please try again.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The account service returned an invalid response.');
  }

  const profile = result?.data?.profile;

  if (
    !profile ||
    profile.id !== session.user.id ||
    !VALID_ROLES.has(profile.role) ||
    profile.is_active !== true
  ) {
    throw new Error('Your account could not be verified. Please contact support.');
  }

  return { profile, mustChangePassword: false };
}

async function revokeSession(client) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    throw new Error('Unable to clear the current session.');
  }
}

async function clearRejectedSession(client, verificationError) {
  try {
    await revokeSession(client);
  } catch {
    throw new Error(
      'Your session could not be cleared. Close this browser window and contact support.',
    );
  }

  throw verificationError;
}

export async function signIn(
  email,
  password,
  { client = getSupabaseClient(), fetchImpl = fetch } = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('Enter your email address and password to continue.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error || !data?.session) {
    throw authenticationError();
  }

  try {
    const applicationState = await getApplicationProfile(data.session, { fetchImpl });
    return { session: data.session, ...applicationState };
  } catch (error) {
    await clearRejectedSession(client, error);
  }
}

export async function restoreSession(
  { client = getSupabaseClient(), fetchImpl = fetch } = {},
) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error('Unable to restore your session. Please sign in again.');
  }

  if (!data?.session) {
    return null;
  }

  try {
    const applicationState = await getApplicationProfile(data.session, { fetchImpl });
    return { session: data.session, ...applicationState };
  } catch (error) {
    await clearRejectedSession(client, error);
  }
}

export async function changeRequiredPassword(
  session,
  password,
  { fetchImpl = fetch } = {},
) {
  if (!session?.access_token) {
    throw new Error('Your session is no longer valid. Please sign in again.');
  }

  let response;
  try {
    response = await fetchImpl('/api/me/password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    const currentState = await getApplicationProfile(session, { fetchImpl });
    if (!currentState.mustChangePassword) {
      return currentState;
    }
    throw new Error('Unable to complete password setup. Submit again to retry safely.');
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    const currentState = await getApplicationProfile(session, { fetchImpl });
    if (!currentState.mustChangePassword) {
      return currentState;
    }

    if (errorBody?.error?.code === 'PASSWORD_PROFILE_UPDATE_PENDING') {
      throw new Error(
        'Your password was changed, but account setup is still pending. Submit a new password to safely retry.',
      );
    }

    if (errorBody?.error?.code === 'INVALID_PASSWORD') {
      throw new Error(errorBody.error.message);
    }

    throw new Error('Unable to complete password setup. Submit again to retry safely.');
  }

  const currentState = await getApplicationProfile(session, { fetchImpl });
  if (currentState.mustChangePassword || !currentState.profile) {
    throw new Error('Password setup is not confirmed yet. Please try again.');
  }

  return currentState;
}

export async function signOut({ client = getSupabaseClient() } = {}) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    throw new Error('Unable to clear the current session.');
  }
}
