import { authenticateRequest, requireSuperAdmin } from './_shared/auth.js';
import { errorResponse, HttpError, jsonResponse } from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';
import { generateTemporaryPassword } from './_shared/temporaryPassword.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 200;
const PHONE_MAX_LENGTH = 32;
const AUTH_USERS_PAGE_SIZE = 1000;

function readNutritionistInput(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !['full_name', 'email', 'phone'].includes(key),
    ) ||
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
        ? body.phone.trim() || null
        : undefined;

  if (!fullName || fullName.length > NAME_MAX_LENGTH) {
    throw new HttpError(400, 'INVALID_FULL_NAME', 'Informe o nome completo.');
  }
  if (
    !email ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(email) ||
    email.endsWith('@accounts.my-diets.test')
  ) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  }
  if (phone === undefined || (phone && phone.length > PHONE_MAX_LENGTH)) {
    throw new HttpError(400, 'INVALID_PHONE', 'Confira o WhatsApp informado.');
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new HttpError(400, 'INVALID_PHONE', 'Confira o WhatsApp informado.');
    }
  }

  return { fullName, email, phone };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'Envie uma solicitação JSON válida.');
  }
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
    'NUTRITIONIST_OPERATION_UNAVAILABLE',
    'Não foi possível concluir a operação com o nutricionista.',
  );
}

async function removeCreatedUser(client, userId) {
  try {
    const result = await client.auth.admin.deleteUser(userId);
    return !result.error;
  } catch {
    return false;
  }
}

async function listNutritionists(client, request) {
  const search = new URL(request.url).searchParams.get('search')?.trim() ?? '';
  if (search.length > 100) {
    throw new HttpError(400, 'INVALID_SEARCH', 'A busca deve ter no máximo 100 caracteres.');
  }

  let profilesResult;
  try {
    profilesResult = await client
      .from('profiles')
      .select('id, full_name, is_active, created_at, nutritionist_details(phone)')
      .eq('role', 'ADMIN')
      .order('full_name', { ascending: true });
  } catch {
    throw new HttpError(
      503,
      'NUTRITIONIST_LIST_UNAVAILABLE',
      'A lista de nutricionistas está temporariamente indisponível.',
    );
  }
  if (profilesResult.error || !Array.isArray(profilesResult.data)) {
    throw new HttpError(
      503,
      'NUTRITIONIST_LIST_UNAVAILABLE',
      'A lista de nutricionistas está temporariamente indisponível.',
    );
  }

  const profiles = profilesResult.data;
  const userIds = new Set(profiles.map(({ id }) => id));
  const usersById = new Map();
  for (let page = 1; userIds.size > usersById.size; page += 1) {
    let usersResult;
    try {
      usersResult = await client.auth.admin.listUsers({
        page,
        perPage: AUTH_USERS_PAGE_SIZE,
      });
    } catch {
      throw new HttpError(
        503,
        'NUTRITIONIST_LIST_UNAVAILABLE',
        'A lista de nutricionistas está temporariamente indisponível.',
      );
    }
    const users = usersResult.data?.users;
    if (usersResult.error || !Array.isArray(users)) {
      throw new HttpError(
        503,
        'NUTRITIONIST_LIST_UNAVAILABLE',
        'A lista de nutricionistas está temporariamente indisponível.',
      );
    }
    for (const user of users) {
      if (userIds.has(user.id)) usersById.set(user.id, user);
    }
    if (users.length < AUTH_USERS_PAGE_SIZE) break;
  }
  if (usersById.size !== userIds.size) {
    throw new HttpError(
      503,
      'NUTRITIONIST_LIST_UNAVAILABLE',
      'Não foi possível confirmar os dados de acesso dos nutricionistas.',
    );
  }

  const normalizedSearch = search.toLocaleLowerCase('pt-BR');
  const nutritionists = profiles
    .map((profile) => {
      const details = Array.isArray(profile.nutritionist_details)
        ? profile.nutritionist_details[0]
        : profile.nutritionist_details;
      return {
        id: profile.id,
        full_name: profile.full_name,
        email: usersById.get(profile.id)?.email ?? '',
        phone: details?.phone ?? null,
        is_active: profile.is_active,
        created_at: profile.created_at,
      };
    })
    .filter((nutritionist) =>
      [
        nutritionist.full_name,
        nutritionist.email,
        nutritionist.phone ?? '',
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch)),
    );

  return jsonResponse(
    200,
    { data: { nutritionists } },
    { 'Cache-Control': 'no-store, private' },
  );
}

async function createNutritionist(client, request, createPassword) {
  const { fullName, email, phone } = readNutritionistInput(await readJson(request));
  const temporaryPassword = createPassword();
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
  if (authResult.error) throw providerFailure(authResult.error);

  const userId = authResult.data?.user?.id;
  if (!userId) {
    throw new HttpError(
      503,
      'NUTRITIONIST_CREATION_UNAVAILABLE',
      'Não foi possível concluir a criação da conta.',
    );
  }

  let profileResult;
  try {
    profileResult = await client.from('profiles').insert({
      id: userId,
      full_name: fullName,
      role: 'ADMIN',
      must_change_password: true,
      is_active: true,
    });
  } catch {
    profileResult = { error: true };
  }
  if (profileResult.error) {
    const cleanupSucceeded = await removeCreatedUser(client, userId);
    throw new HttpError(
      cleanupSucceeded ? 503 : 500,
      cleanupSucceeded
        ? 'NUTRITIONIST_CREATION_UNAVAILABLE'
        : 'NUTRITIONIST_CREATION_RECOVERY_REQUIRED',
      cleanupSucceeded
        ? 'Não foi possível concluir a criação da conta.'
        : 'A criação da conta ficou incompleta. Entre em contato com o suporte antes de tentar novamente.',
    );
  }

  let detailsResult;
  try {
    detailsResult = await client
      .from('nutritionist_details')
      .insert({ user_id: userId, phone });
  } catch {
    detailsResult = { error: true };
  }
  if (detailsResult.error) {
    let cleanupSucceeded = false;
    try {
      const cleanup = await client.auth.admin.deleteUser(userId);
      cleanupSucceeded = !cleanup.error;
    } catch {
      cleanupSucceeded = false;
    }
    throw new HttpError(
      cleanupSucceeded ? 503 : 500,
      cleanupSucceeded
        ? 'NUTRITIONIST_CREATION_UNAVAILABLE'
        : 'NUTRITIONIST_CREATION_RECOVERY_REQUIRED',
      cleanupSucceeded
        ? 'Não foi possível concluir a criação da conta. Tente novamente.'
        : 'A criação da conta ficou incompleta. Entre em contato com o suporte antes de tentar novamente.',
    );
  }

  return jsonResponse(
    201,
    {
      data: {
        nutritionist: {
          id: userId,
          full_name: fullName,
          email,
          phone,
          is_active: true,
        },
        temporary_password: temporaryPassword,
      },
    },
    { 'Cache-Control': 'no-store, private' },
  );
}

function getNutritionistId(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new HttpError(400, 'INVALID_NUTRITIONIST_ID', 'Identificador inválido.');
  }
  return id;
}

async function getNutritionist(client, id) {
  let profileResult;
  try {
    profileResult = await client
      .from('profiles')
      .select('id, full_name, is_active, nutritionist_details(phone)')
      .eq('id', id)
      .eq('role', 'ADMIN')
      .maybeSingle();
  } catch {
    throw new HttpError(503, 'NUTRITIONIST_LOOKUP_UNAVAILABLE', 'Não foi possível carregar o nutricionista.');
  }
  if (profileResult.error) {
    throw new HttpError(503, 'NUTRITIONIST_LOOKUP_UNAVAILABLE', 'Não foi possível carregar o nutricionista.');
  }
  if (!profileResult.data) {
    throw new HttpError(404, 'NUTRITIONIST_NOT_FOUND', 'Nutricionista não encontrado.');
  }

  let userResult;
  try {
    userResult = await client.auth.admin.getUserById(id);
  } catch {
    throw new HttpError(503, 'NUTRITIONIST_LOOKUP_UNAVAILABLE', 'Não foi possível carregar o nutricionista.');
  }
  if (userResult.error || !userResult.data?.user?.email) {
    throw new HttpError(503, 'NUTRITIONIST_LOOKUP_UNAVAILABLE', 'Não foi possível carregar os dados de acesso.');
  }

  const details = Array.isArray(profileResult.data.nutritionist_details)
    ? profileResult.data.nutritionist_details[0]
    : profileResult.data.nutritionist_details;
  return {
    id,
    full_name: profileResult.data.full_name,
    email: userResult.data.user.email,
    phone: details?.phone ?? null,
    is_active: profileResult.data.is_active,
  };
}

async function updateNutritionist(client, request, id) {
  const input = readNutritionistInput(await readJson(request));
  const previous = await getNutritionist(client, id);

  if (input.email !== previous.email) {
    let authResult;
    try {
      authResult = await client.auth.admin.updateUserById(id, {
        email: input.email,
        email_confirm: true,
      });
    } catch (error) {
      throw providerFailure(error);
    }
    if (authResult.error) throw providerFailure(authResult.error);
  }

  let profileResult;
  try {
    profileResult = await client
      .from('profiles')
      .update({ full_name: input.fullName })
      .eq('id', id)
      .eq('role', 'ADMIN')
      .select('id')
      .maybeSingle();
  } catch {
    profileResult = { error: true };
  }
  if (profileResult.error || profileResult.data?.id !== id) {
    let emailRestored = input.email === previous.email;
    if (input.email !== previous.email) {
      try {
        const result = await client.auth.admin.updateUserById(id, {
          email: previous.email,
          email_confirm: true,
        });
        emailRestored = !result.error;
      } catch {
        emailRestored = false;
      }
    }
    throw new HttpError(
      emailRestored ? 503 : 500,
      emailRestored
        ? 'NUTRITIONIST_UPDATE_UNAVAILABLE'
        : 'NUTRITIONIST_UPDATE_RECOVERY_REQUIRED',
      emailRestored
        ? 'Não foi possível atualizar o nutricionista.'
        : 'A atualização ficou incompleta. Entre em contato com o suporte.',
    );
  }

  let detailsResult;
  try {
    detailsResult = await client
      .from('nutritionist_details')
      .upsert({ user_id: id, phone: input.phone }, { onConflict: 'user_id' });
  } catch {
    detailsResult = { error: true };
  }
  if (detailsResult.error) {
    let profileRestored = false;
    let emailRestored = input.email === previous.email;
    try {
      const result = await client
        .from('profiles')
        .update({ full_name: previous.full_name })
        .eq('id', id)
        .eq('role', 'ADMIN');
      profileRestored = !result.error;
    } catch {
      profileRestored = false;
    }
    if (!emailRestored) {
      try {
        const result = await client.auth.admin.updateUserById(id, {
          email: previous.email,
          email_confirm: true,
        });
        emailRestored = !result.error;
      } catch {
        emailRestored = false;
      }
    }
    throw new HttpError(
      profileRestored && emailRestored ? 503 : 500,
      profileRestored && emailRestored
        ? 'NUTRITIONIST_UPDATE_UNAVAILABLE'
        : 'NUTRITIONIST_UPDATE_RECOVERY_REQUIRED',
      profileRestored && emailRestored
        ? 'Não foi possível atualizar o nutricionista.'
        : 'A atualização ficou incompleta e não pôde ser revertida. Entre em contato com o suporte.',
    );
  }

  return jsonResponse(
    200,
    {
      data: {
        nutritionist: {
          ...previous,
          full_name: input.fullName,
          email: input.email,
          phone: input.phone,
        },
      },
    },
    { 'Cache-Control': 'no-store, private' },
  );
}

async function updateNutritionistStatus(client, request, id) {
  const body = await readJson(request);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof body.is_active !== 'boolean'
  ) {
    throw new HttpError(400, 'INVALID_STATUS', 'Informe um status válido.');
  }
  let result;
  try {
    result = await client
      .from('profiles')
      .update({ is_active: body.is_active })
      .eq('id', id)
      .eq('role', 'ADMIN')
      .select('id')
      .maybeSingle();
  } catch {
    result = { error: true };
  }
  if (result.error) {
    throw new HttpError(
      503,
      'NUTRITIONIST_STATUS_UPDATE_UNAVAILABLE',
      'Não foi possível atualizar o status do nutricionista.',
    );
  }
  if (!result.data) {
    throw new HttpError(404, 'NUTRITIONIST_NOT_FOUND', 'Nutricionista não encontrado.');
  }
  return jsonResponse(
    200,
    { data: { nutritionist: { id, is_active: body.is_active } } },
    { 'Cache-Control': 'no-store, private' },
  );
}

export default async function nutritionists(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
    createPassword = generateTemporaryPassword,
  } = {},
) {
  try {
    requireSuperAdmin(await authenticate(request));
    const client = createAdminClient();
    if (request.method === 'GET') return await listNutritionists(client, request);
    if (request.method === 'POST') {
      return await createNutritionist(client, request, createPassword);
    }
    const id = getNutritionistId(request);
    if (request.method === 'PUT') return await updateNutritionist(client, request, id);
    if (request.method === 'PATCH') {
      return await updateNutritionistStatus(client, request, id);
    }
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
