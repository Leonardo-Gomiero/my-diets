import { authenticateRequest, requireAdmin } from './auth.js';
import { errorResponse, HttpError, jsonResponse } from './http.js';
import { createServerSupabaseClient } from './supabase.js';
import { generateTemporaryPassword } from './temporaryPassword.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 32;

function getPatientId(request) {
  const patientId = new URL(request.url).searchParams.get('id');
  if (!patientId || !PATIENT_ID_PATTERN.test(patientId)) {
    throw new HttpError(400, 'INVALID_PATIENT_ID', 'Identificador de paciente inválido.');
  }
  return patientId;
}

async function getPatientRecord(client, patientId, nutritionistId) {
  let result;
  try {
    result = await client
      .from('profiles')
      .select(
        'id, full_name, role, nutritionist_id, is_active, must_change_password, created_at, student_details(phone)',
      )
      .eq('id', patientId)
      .eq('role', 'STUDENT')
      .eq('nutritionist_id', nutritionistId)
      .maybeSingle();
  } catch {
    throw new HttpError(
      503,
      'PATIENT_LOOKUP_UNAVAILABLE',
      'Os dados do paciente estão temporariamente indisponíveis.',
    );
  }

  if (result.error) {
    throw new HttpError(
      503,
      'PATIENT_LOOKUP_UNAVAILABLE',
      'Os dados do paciente estão temporariamente indisponíveis.',
    );
  }

  if (!result.data) {
    throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado.');
  }

  return result.data;
}

async function getAuthUser(client, patientId) {
  let result;
  try {
    result = await client.auth.admin.getUserById(patientId);
  } catch {
    throw new HttpError(
      503,
      'PATIENT_LOOKUP_UNAVAILABLE',
      'Os dados do paciente estão temporariamente indisponíveis.',
    );
  }

  if (result.error) {
    if (result.error.code === 'user_not_found') {
      throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado.');
    }
    throw new HttpError(
      503,
      'PATIENT_LOOKUP_UNAVAILABLE',
      'Os dados do paciente estão temporariamente indisponíveis.',
    );
  }

  if (!result.data?.user) {
    throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado.');
  }

  if (typeof result.data.user.email !== 'string') {
    throw new HttpError(
      503,
      'PATIENT_LOOKUP_UNAVAILABLE',
      'Os dados do paciente estão temporariamente indisponíveis.',
    );
  }

  return result.data.user;
}

function toPatient(profile, authUser) {
  const details = Array.isArray(profile.student_details)
    ? profile.student_details[0]
    : profile.student_details;

  return {
    id: profile.id,
    full_name: profile.full_name,
    email: authUser.email ?? '',
    phone: details?.phone ?? null,
    is_active: profile.is_active,
    created_at: profile.created_at,
  };
}

export async function getPatient(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'GET') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    const context = requireAdmin(await authenticate(request));
    const patientId = getPatientId(request);
    const client = createAdminClient();
    const profile = await getPatientRecord(client, patientId, context.user.id);
    const authUser = await getAuthUser(client, patientId);
    return jsonResponse(
      200,
      { data: { patient: toPatient(profile, authUser) } },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function validateUpdateBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'Envie uma solicitação JSON válida.');
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['full_name', 'email', 'phone'].includes(key)) ||
    !Object.hasOwn(body, 'full_name') ||
    !Object.hasOwn(body, 'email') ||
    !Object.hasOwn(body, 'phone')
  ) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Confira os dados informados.');
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone =
    body.phone === null
      ? null
      : typeof body.phone === 'string'
        ? body.phone.trim()
        : undefined;

  if (!fullName || fullName.length > MAX_NAME_LENGTH) {
    throw new HttpError(
      400,
      'INVALID_FULL_NAME',
      `Informe o nome completo (até ${MAX_NAME_LENGTH} caracteres).`,
    );
  }

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  }

  if (phone === undefined || phone.length > MAX_PHONE_LENGTH) {
    throw new HttpError(
      400,
      'INVALID_PHONE',
      `O telefone deve ter no máximo ${MAX_PHONE_LENGTH} caracteres.`,
    );
  }

  return { fullName, email, phone: phone || null };
}

async function restorePatient(client, patientId, nutritionistId, profile, authUser) {
  let restored = true;
  try {
    const profileResult = await client
      .from('profiles')
      .update({ full_name: profile.full_name })
      .eq('id', patientId)
      .eq('role', 'STUDENT')
      .eq('nutritionist_id', nutritionistId);
    restored = restored && !profileResult.error;
  } catch {
    restored = false;
  }

  const details = Array.isArray(profile.student_details)
    ? profile.student_details[0]
    : profile.student_details;
  if (details) {
    try {
      const detailsResult = await client
        .from('student_details')
        .update({ phone: details.phone ?? null })
        .eq('user_id', patientId);
      restored = restored && !detailsResult.error;
    } catch {
      restored = false;
    }
  } else {
    try {
      const detailsResult = await client
        .from('student_details')
        .update({ phone: null })
        .eq('user_id', patientId);
      restored = restored && !detailsResult.error;
    } catch {
      restored = false;
    }
  }

  try {
    const authResult = await client.auth.admin.updateUserById(patientId, {
      email: authUser.email,
      email_confirm: true,
    });
    restored = restored && !authResult.error;
  } catch {
    restored = false;
  }

  return restored;
}

function updateFailure(error) {
  if (
    error?.status === 409 ||
    error?.code === 'user_already_exists' ||
    error?.code === 'email_exists'
  ) {
    return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Este e-mail já está cadastrado.');
  }
  return new HttpError(
    503,
    'PATIENT_UPDATE_UNAVAILABLE',
    'Não foi possível atualizar os dados do paciente.',
  );
}

export async function updatePatient(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'PUT') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    const context = requireAdmin(await authenticate(request));
    const patientId = getPatientId(request);
    const input = await validateUpdateBody(request);
    const client = createAdminClient();
    const profile = await getPatientRecord(client, patientId, context.user.id);
    const authUser = await getAuthUser(client, patientId);
    const previousDetails = Array.isArray(profile.student_details)
      ? profile.student_details[0]
      : profile.student_details;

    let updateError;
    try {
      const profileResult = await client
        .from('profiles')
        .update({ full_name: input.fullName })
        .eq('id', patientId)
        .eq('role', 'STUDENT')
        .eq('nutritionist_id', context.user.id);
      updateError = profileResult.error;
    } catch (error) {
      updateError = error;
    }

    if (!updateError && input.phone !== (previousDetails?.phone ?? null)) {
      try {
        const detailsResult = previousDetails
          ? await client
              .from('student_details')
              .update({ phone: input.phone })
              .eq('user_id', patientId)
          : input.phone
            ? await client
                .from('student_details')
                .insert({ user_id: patientId, phone: input.phone })
            : { error: null };
        updateError = detailsResult.error;
      } catch (error) {
        updateError = error;
      }
    }

    if (!updateError && input.email !== authUser.email) {
      try {
        const authResult = await client.auth.admin.updateUserById(patientId, {
          email: input.email,
          email_confirm: true,
        });
        updateError = authResult.error;
      } catch (error) {
        updateError = error;
      }
    }

    if (updateError) {
      const restored = await restorePatient(
        client,
        patientId,
        context.user.id,
        profile,
        authUser,
      );
      if (!restored) {
        throw new HttpError(
          500,
          'PATIENT_UPDATE_RECOVERY_REQUIRED',
          'A atualização ficou incompleta e não pôde ser revertida. Entre em contato com o suporte.',
        );
      }
      throw updateFailure(updateError);
    }

    return jsonResponse(
      200,
      {
        data: {
          patient: {
            ...toPatient(profile, authUser),
            full_name: input.fullName,
            email: input.email,
            phone: input.phone,
          },
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function updatePatientStatus(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'PATCH') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    const context = requireAdmin(await authenticate(request));
    const patientId = getPatientId(request);
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'INVALID_REQUEST', 'Envie uma solicitação JSON válida.');
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof body.is_active !== 'boolean' ||
      Object.keys(body).some((key) => key !== 'is_active')
    ) {
      throw new HttpError(400, 'INVALID_STATUS', 'Informe um status válido.');
    }

    const client = createAdminClient();
    const profile = await getPatientRecord(client, patientId, context.user.id);
    if (profile.is_active === body.is_active) {
      return jsonResponse(
        200,
        { data: { patient: { id: profile.id, is_active: profile.is_active } } },
        { 'Cache-Control': 'no-store, private' },
      );
    }

    let result;
    try {
      result = await client
        .from('profiles')
        .update({ is_active: body.is_active })
        .eq('id', patientId)
        .eq('role', 'STUDENT')
        .eq('nutritionist_id', context.user.id);
    } catch {
      result = { error: true };
    }

    if (result.error) {
      throw new HttpError(
        503,
        'PATIENT_STATUS_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar o status do paciente.',
      );
    }

    return jsonResponse(
      200,
      { data: { patient: { id: profile.id, is_active: body.is_active } } },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function resetPatientPassword(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
    createPassword = generateTemporaryPassword,
  } = {},
) {
  if (request.method !== 'POST') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    const context = requireAdmin(await authenticate(request));
    const patientId = getPatientId(request);
    const client = createAdminClient();
    const profile = await getPatientRecord(client, patientId, context.user.id);
    if (profile.is_active !== true) {
      throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Não é possível redefinir a senha de uma conta inativa.');
    }

    const authUser = await getAuthUser(client, patientId);
    const temporaryPassword = createPassword();

    let lockResult;
    try {
      lockResult = await client
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', patientId)
        .eq('role', 'STUDENT')
        .eq('nutritionist_id', context.user.id)
        .eq('is_active', true)
        .select('id, must_change_password')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'PATIENT_PASSWORD_LOCK_FAILED',
        'Não foi possível bloquear o acesso normal da conta. A senha não foi alterada.',
      );
    }

    if (
      lockResult.error ||
      lockResult.data?.id !== patientId ||
      lockResult.data.must_change_password !== true
    ) {
      throw new HttpError(
        503,
        'PATIENT_PASSWORD_LOCK_FAILED',
        'Não foi possível bloquear o acesso normal da conta. A senha não foi alterada.',
      );
    }

    let authResult;
    try {
      authResult = await client.auth.admin.updateUserById(patientId, {
        password: temporaryPassword,
      });
    } catch {
      throw new HttpError(
        503,
        'PATIENT_PASSWORD_RESET_PENDING',
        'A conta está bloqueada para a troca de senha, mas a redefinição não foi confirmada. Tente redefinir novamente.',
      );
    }

    if (authResult.error) {
      throw new HttpError(
        503,
        'PATIENT_PASSWORD_RESET_PENDING',
        'A conta está bloqueada para a troca de senha, mas a redefinição não foi confirmada. Tente redefinir novamente.',
      );
    }

    let confirmation;
    try {
      confirmation = await client
        .from('profiles')
        .select('id, role, nutritionist_id, is_active, must_change_password')
        .eq('id', patientId)
        .eq('nutritionist_id', context.user.id)
        .maybeSingle();
    } catch {
      confirmation = { error: true };
    }

    if (
      confirmation.error ||
      confirmation.data?.id !== patientId ||
      confirmation.data.role !== 'STUDENT' ||
      confirmation.data.is_active !== true ||
      confirmation.data.must_change_password !== true
    ) {
      throw new HttpError(
        503,
        'PATIENT_PASSWORD_RESET_PENDING',
        'A senha foi atualizada, mas não foi possível confirmar o estado de troca obrigatória. A conta permanece bloqueada; redefina a senha novamente.',
      );
    }

    return jsonResponse(
      200,
      {
        data: {
          patient: {
            id: patientId,
            full_name: profile.full_name,
            email: authResult.data?.user?.email ?? authUser.email,
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
