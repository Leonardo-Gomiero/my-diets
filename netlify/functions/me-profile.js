import { authenticateRequest, requireAdmin } from './_shared/auth.js';
import { errorResponse, HttpError, jsonResponse } from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';

const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 32;

function validateProfile(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['full_name', 'whatsapp'].includes(key)) ||
    !Object.hasOwn(body, 'full_name') ||
    !Object.hasOwn(body, 'whatsapp')
  ) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Confira os dados informados.');
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const whatsapp =
    body.whatsapp === null
      ? null
      : typeof body.whatsapp === 'string'
        ? body.whatsapp.trim() || null
        : undefined;

  if (!fullName || fullName.length > MAX_NAME_LENGTH) {
    throw new HttpError(
      400,
      'INVALID_FULL_NAME',
      `Informe o nome completo (até ${MAX_NAME_LENGTH} caracteres).`,
    );
  }

  if (whatsapp === undefined || (whatsapp && whatsapp.length > MAX_PHONE_LENGTH)) {
    throw new HttpError(400, 'INVALID_PHONE', 'Confira o WhatsApp informado.');
  }

  if (whatsapp) {
    const digits = whatsapp.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new HttpError(
        400,
        'INVALID_PHONE',
        'Informe um WhatsApp com código do país e DDD.',
      );
    }
  }

  return { fullName, whatsapp };
}

export default async function updateNutritionistProfile(
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
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'INVALID_REQUEST', 'Envie uma solicitação JSON válida.');
    }

    const { fullName, whatsapp } = validateProfile(body);
    const client = createAdminClient();
    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', context.user.id)
        .eq('role', 'ADMIN');
    } catch {
      throw new HttpError(
        503,
        'PROFILE_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar seu perfil. Tente novamente.',
      );
    }

    if (profileResult.error) {
      throw new HttpError(
        503,
        'PROFILE_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar seu perfil. Tente novamente.',
      );
    }

    let detailsResult;
    try {
      detailsResult = await client
        .from('nutritionist_details')
        .upsert(
          { user_id: context.user.id, phone: whatsapp },
          { onConflict: 'user_id' },
        );
    } catch {
      detailsResult = { error: true };
    }

    if (detailsResult.error) {
      let restored;
      try {
        restored = await client
          .from('profiles')
          .update({ full_name: context.profile.full_name })
          .eq('id', context.user.id)
          .eq('role', 'ADMIN');
      } catch {
        restored = { error: true };
      }

      if (restored.error) {
        throw new HttpError(
          500,
          'PROFILE_UPDATE_RECOVERY_REQUIRED',
          'A atualização ficou incompleta e não pôde ser revertida. Entre em contato com o suporte.',
        );
      }
      throw new HttpError(
        503,
        'PROFILE_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar seu perfil. Tente novamente.',
      );
    }

    return jsonResponse(
      200,
      {
        data: {
          profile: {
            id: context.user.id,
            full_name: fullName,
            whatsapp,
          },
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
