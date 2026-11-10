import {
  createServerSupabaseClient,
  createTokenVerifierClient,
} from './supabase.js';
import { HttpError } from './http.js';

function bearerTokenFrom(request) {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    throw new HttpError(
      401,
      'UNAUTHENTICATED',
      'A valid bearer token is required.',
    );
  }

  return match[1];
}

function authProviderError(error) {
  if (error?.status === 401 || error?.status === 403) {
    return new HttpError(
      401,
      'UNAUTHENTICATED',
      'A valid bearer token is required.',
    );
  }

  return new HttpError(
    503,
    'AUTHENTICATION_UNAVAILABLE',
    'Authentication is temporarily unavailable.',
  );
}

export async function authenticateRequest(
  request,
  {
    createVerifierClient = createTokenVerifierClient,
    createProfileClient = createServerSupabaseClient,
    allowPasswordChange = false,
  } = {},
) {
  const token = bearerTokenFrom(request);
  let authResult;

  try {
    authResult = await createVerifierClient().auth.getUser(token);
  } catch (error) {
    throw authProviderError(error);
  }

  if (authResult.error) {
    throw authProviderError(authResult.error);
  }

  const user = authResult.data?.user;

  if (!user?.id) {
    throw new HttpError(
      401,
      'UNAUTHENTICATED',
      'A valid bearer token is required.',
    );
  }

  let profileResult;

  try {
    profileResult = await createProfileClient()
      .from('profiles')
      .select('id, role, is_active, must_change_password')
      .eq('id', user.id)
      .maybeSingle();
  } catch {
    throw new HttpError(
      503,
      'PROFILE_LOOKUP_UNAVAILABLE',
      'Account information is temporarily unavailable.',
    );
  }

  if (profileResult.error) {
    throw new HttpError(
      503,
      'PROFILE_LOOKUP_UNAVAILABLE',
      'Account information is temporarily unavailable.',
    );
  }

  const profile = profileResult.data;

  if (!profile || profile.id !== user.id) {
    throw new HttpError(403, 'PROFILE_NOT_FOUND', 'Account access is not set up.');
  }

  if (!profile.is_active) {
    throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.');
  }

  if (
    !allowPasswordChange &&
    profile.role === 'STUDENT' &&
    profile.must_change_password
  ) {
    throw new HttpError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Change your password before accessing this resource.',
    );
  }

  return { user, profile };
}

export function requireActiveAccount(context) {
  if (!context?.profile?.is_active) {
    throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.');
  }

  return context;
}

export function requireRole(context, role) {
  requireActiveAccount(context);

  if (context.profile.role !== role) {
    throw new HttpError(403, 'FORBIDDEN', 'You are not allowed to perform this action.');
  }

  return context;
}

export function requireAdmin(context) {
  return requireRole(context, 'ADMIN');
}

export function requirePasswordChangeComplete(context) {
  requireActiveAccount(context);

  if (context.profile.must_change_password) {
    throw new HttpError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Change your password before accessing this resource.',
    );
  }

  return context;
}
