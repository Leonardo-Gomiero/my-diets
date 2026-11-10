import { authenticateRequest, requireAdmin } from './_shared/auth.js';
import {
  errorResponse,
  HttpError,
  jsonResponse,
} from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';
import { generateTemporaryPassword } from './_shared/temporaryPassword.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 32;

async function readPatientInput(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'A valid JSON body is required.');
  }

  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone =
    body?.phone === undefined || body.phone === null
      ? null
      : typeof body.phone === 'string'
        ? body.phone.trim()
        : undefined;

  if (!fullName || fullName.length > MAX_NAME_LENGTH) {
    throw new HttpError(
      400,
      'INVALID_FULL_NAME',
      `Full name must be between 1 and ${MAX_NAME_LENGTH} characters.`,
    );
  }

  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email)
  ) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  }

  if (phone === undefined || (phone !== null && phone.length > MAX_PHONE_LENGTH)) {
    throw new HttpError(
      400,
      'INVALID_PHONE',
      `Phone must be at most ${MAX_PHONE_LENGTH} characters.`,
    );
  }

  return { fullName, email, phone: phone || null };
}

async function cleanupOrphanedUser(client, userId) {
  let profileRemoved = false;
  let authUserRemoved = false;

  try {
    const { error } = await client
      .from('profiles')
      .delete()
      .eq('id', userId);
    profileRemoved = !error;
  } catch {
    profileRemoved = false;
  }

  try {
    const { error } = await client.auth.admin.deleteUser(userId);
    authUserRemoved = !error;
  } catch {
    authUserRemoved = false;
  }

  return profileRemoved && authUserRemoved;
}

function providerFailure(error) {
  if (
    error?.status === 409 ||
    error?.code === 'user_already_exists' ||
    error?.code === 'email_exists'
  ) {
    return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
  }

  return new HttpError(
    503,
    'PATIENT_CREATION_UNAVAILABLE',
    'Patient account creation is temporarily unavailable.',
  );
}

export default async function createPatient(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
    createPassword = generateTemporaryPassword,
  } = {},
) {
  if (request.method !== 'POST') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.'),
    );
  }

  try {
    const context = await authenticate(request);
    requireAdmin(context);
    const { fullName, email, phone } = await readPatientInput(request);
    const temporaryPassword = createPassword();
    const client = createAdminClient();

    let authResult;
    try {
      authResult = await client.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
    } catch (error) {
      throw providerFailure(error);
    }

    if (authResult.error) {
      throw providerFailure(authResult.error);
    }

    const userId = authResult.data?.user?.id;
    if (!userId) {
      throw new HttpError(
        503,
        'PATIENT_CREATION_UNAVAILABLE',
        'Patient account creation is temporarily unavailable.',
      );
    }

    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .insert({
          id: userId,
          full_name: fullName,
          role: 'STUDENT',
          must_change_password: true,
          is_active: true,
        });
    } catch {
      profileResult = { error: true };
    }

    if (profileResult.error) {
      const cleanupSucceeded = await cleanupOrphanedUser(client, userId);
      throw new HttpError(
        cleanupSucceeded ? 503 : 500,
        cleanupSucceeded
          ? 'PATIENT_PROFILE_CREATION_FAILED'
          : 'PATIENT_CREATION_RECOVERY_REQUIRED',
        cleanupSucceeded
          ? 'Patient setup could not be completed. The account was removed; try again.'
          : 'Patient setup failed and account cleanup could not be confirmed. Contact support before retrying.',
      );
    }

    if (phone) {
      let detailsResult;
      try {
        detailsResult = await client
          .from('student_details')
          .insert({ user_id: userId, phone });
      } catch {
        detailsResult = { error: true };
      }

      if (detailsResult.error) {
        const cleanupSucceeded = await cleanupOrphanedUser(client, userId);
        throw new HttpError(
          cleanupSucceeded ? 503 : 500,
          cleanupSucceeded
            ? 'PATIENT_PROFILE_CREATION_FAILED'
            : 'PATIENT_CREATION_RECOVERY_REQUIRED',
          cleanupSucceeded
            ? 'Patient setup could not be completed. The account was removed; try again.'
            : 'Patient setup failed and account cleanup could not be confirmed. Contact support before retrying.',
        );
      }
    }

    return jsonResponse(
      201,
      {
        data: {
          patient: {
            id: userId,
            full_name: fullName,
            email,
            phone,
            role: 'STUDENT',
            must_change_password: true,
            is_active: true,
          },
          temporary_password: temporaryPassword,
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
