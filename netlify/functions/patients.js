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
const MAX_SEARCH_LENGTH = 100;
const AUTH_USERS_PAGE_SIZE = 1000;

export async function listPatients(
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
    const context = await authenticate(request);
    requireAdmin(context);

    const search = new URL(request.url).searchParams.get('search')?.trim() ?? '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new HttpError(
        400,
        'INVALID_SEARCH',
        `A busca deve ter no máximo ${MAX_SEARCH_LENGTH} caracteres.`,
      );
    }

    const client = createAdminClient();
    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .select('id, full_name, is_active, created_at, student_details(phone)')
        .eq('role', 'STUDENT')
        .eq('nutritionist_id', context.user.id)
        .order('full_name', { ascending: true });
    } catch {
      throw new HttpError(
        503,
        'PATIENT_LIST_UNAVAILABLE',
        'A lista de pacientes está temporariamente indisponível.',
      );
    }

    if (profileResult.error || !Array.isArray(profileResult.data)) {
      throw new HttpError(
        503,
        'PATIENT_LIST_UNAVAILABLE',
        'A lista de pacientes está temporariamente indisponível.',
      );
    }

    const profiles = profileResult.data;
    const userIds = new Set(profiles.map((profile) => profile.id));
    const usersById = new Map();
    let page = 1;

    while (userIds.size > usersById.size) {
      let usersResult;
      try {
        usersResult = await client.auth.admin.listUsers({
          page,
          perPage: AUTH_USERS_PAGE_SIZE,
        });
      } catch {
        throw new HttpError(
          503,
          'PATIENT_LIST_UNAVAILABLE',
          'A lista de pacientes está temporariamente indisponível.',
        );
      }

      const users = usersResult.data?.users;
      if (usersResult.error || !Array.isArray(users)) {
        throw new HttpError(
          503,
          'PATIENT_LIST_UNAVAILABLE',
          'A lista de pacientes está temporariamente indisponível.',
        );
      }

      for (const user of users) {
        if (userIds.has(user.id)) {
          usersById.set(user.id, user);
        }
      }

      if (users.length < AUTH_USERS_PAGE_SIZE) {
        break;
      }
      page += 1;
    }

    const normalizedSearch = search.toLocaleLowerCase('pt-BR');
    const patients = profiles
      .map((profile) => {
        const details = Array.isArray(profile.student_details)
          ? profile.student_details[0]
          : profile.student_details;

        return {
          id: profile.id,
          full_name: profile.full_name,
          email: usersById.get(profile.id)?.email ?? '',
          phone: details?.phone ?? null,
          is_active: profile.is_active,
          created_at: profile.created_at,
        };
      })
      .filter((patient) =>
        normalizedSearch
          ? [
              patient.full_name,
              patient.email,
              patient.phone ?? '',
            ].some((value) =>
              value.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
            )
          : true,
      );

    return jsonResponse(200, { data: { patients } }, {
      'Cache-Control': 'no-store, private',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function readPatientInput(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'Envie uma solicitação JSON válida.');
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
      `Informe o nome completo (até ${MAX_NAME_LENGTH} caracteres).`,
    );
  }

  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email)
  ) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  }

  if (phone === undefined || (phone !== null && phone.length > MAX_PHONE_LENGTH)) {
    throw new HttpError(
      400,
      'INVALID_PHONE',
      `O telefone deve ter no máximo ${MAX_PHONE_LENGTH} caracteres.`,
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
    return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'Este e-mail já está cadastrado.');
  }

  return new HttpError(
    503,
    'PATIENT_CREATION_UNAVAILABLE',
    'A criação da conta está temporariamente indisponível.',
  );
}

async function createPatient(
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
        'A criação da conta está temporariamente indisponível.',
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
          nutritionist_id: context.user.id,
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
          ? 'Não foi possível concluir o cadastro. A conta foi removida; tente novamente.'
          : 'O cadastro falhou e não foi possível confirmar a remoção da conta. Entre em contato com o suporte antes de tentar novamente.',
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
            ? 'Não foi possível concluir o cadastro. A conta foi removida; tente novamente.'
            : 'O cadastro falhou e não foi possível confirmar a remoção da conta. Entre em contato com o suporte antes de tentar novamente.',
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

export default function patients(request, dependencies) {
  if (request.method === 'GET') {
    return listPatients(request, dependencies);
  }
  return createPatient(request, dependencies);
}
