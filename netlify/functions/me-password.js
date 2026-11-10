import { authenticateRequest, requireActiveAccount, requireRole } from './_shared/auth.js';
import {
  errorResponse,
  HttpError,
  successResponse,
} from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

async function readPassword(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'A valid JSON body is required.');
  }

  if (
    typeof body?.password !== 'string' ||
    body.password.length < MIN_PASSWORD_LENGTH ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new HttpError(
      400,
      'INVALID_PASSWORD',
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  return body.password;
}

async function passwordFlagIsCleared(client, userId) {
  let result;
  try {
    result = await client
      .from('profiles')
      .select('id, role, is_active, must_change_password')
      .eq('id', userId)
      .maybeSingle();
  } catch {
    return false;
  }

  if (result.error) {
    return false;
  }

  return (
    result.data?.id === userId &&
    ['ADMIN', 'STUDENT', 'SUPERADMIN'].includes(result.data.role) &&
    result.data.is_active === true &&
    result.data.must_change_password === false
  );
}

export default async function changePassword(
  request,
  {
    authenticate = (incomingRequest) =>
      authenticateRequest(incomingRequest, { allowPasswordChange: true }),
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'POST') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.'),
    );
  }

  try {
    const { user, profile } = await authenticate(request);
    requireActiveAccount({ user, profile });
    if (!['ADMIN', 'STUDENT', 'SUPERADMIN'].includes(profile.role)) {
      requireRole({ user, profile }, 'STUDENT');
    }
    const password = await readPassword(request);
    const client = createAdminClient();

    if (!profile.must_change_password) {
      if (await passwordFlagIsCleared(client, user.id)) {
        return successResponse({ password_change_required: false });
      }

      throw new HttpError(
        503,
        'PASSWORD_STATE_UNAVAILABLE',
        'Account status could not be confirmed. Please try again.',
      );
    }

    let authResult;
    try {
      authResult = await client.auth.admin.updateUserById(user.id, { password });
    } catch {
      throw new HttpError(
        503,
        'PASSWORD_UPDATE_UNAVAILABLE',
        'Password service is temporarily unavailable. Your account still requires a password change.',
      );
    }

    if (authResult.error) {
      throw new HttpError(
        422,
        'PASSWORD_UPDATE_FAILED',
        'The password could not be updated. Check the requirements and try again.',
      );
    }

    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id)
        .in('role', ['ADMIN', 'STUDENT', 'SUPERADMIN'])
        .eq('is_active', true)
        .eq('must_change_password', true)
        .select('id')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'PASSWORD_PROFILE_UPDATE_PENDING',
        'Your password was updated, but account setup is still pending. Submit a new password to safely retry.',
      );
    }

    if (
      profileResult.error ||
      (profileResult.data?.id !== user.id &&
        !(await passwordFlagIsCleared(client, user.id)))
    ) {
      throw new HttpError(
        503,
        'PASSWORD_PROFILE_UPDATE_PENDING',
        'Your password was updated, but account setup is still pending. Submit a new password to safely retry.',
      );
    }

    return successResponse({ password_change_required: false });
  } catch (error) {
    return errorResponse(error);
  }
}
