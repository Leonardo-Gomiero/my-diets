import { authenticateRequest, requireSuperAdmin } from './_shared/auth.js';
import { errorResponse, HttpError, jsonResponse } from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';

const ADMIN_LOGIN_DOMAIN = 'accounts.my-diets.test';
const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/;

export default async function updateAdminLogin(
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
    const context = requireSuperAdmin(await authenticate(request));
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
      Object.keys(body).length !== 1 ||
      typeof body.login !== 'string'
    ) {
      throw new HttpError(400, 'INVALID_ADMIN_LOGIN', 'Informe um login válido.');
    }

    const login = body.login.trim().toLowerCase();
    if (!LOGIN_PATTERN.test(login)) {
      throw new HttpError(
        400,
        'INVALID_ADMIN_LOGIN',
        'Use de 3 a 32 letras, números, pontos, hífens ou sublinhados.',
      );
    }

    const client = createAdminClient();
    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .update({ admin_login: login })
        .eq('id', context.user.id)
        .eq('role', 'SUPERADMIN')
        .select('id')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'ADMIN_LOGIN_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar o login.',
      );
    }
    if (profileResult.error?.code === '23505') {
      throw new HttpError(409, 'ADMIN_LOGIN_ALREADY_USED', 'Este login já está em uso.');
    }
    if (profileResult.error || profileResult.data?.id !== context.user.id) {
      throw new HttpError(
        503,
        'ADMIN_LOGIN_UPDATE_UNAVAILABLE',
        'Não foi possível atualizar o login.',
      );
    }

    const currentEmail = context.user.email;
    const nextEmail = `${login}@${ADMIN_LOGIN_DOMAIN}`;
    if (currentEmail !== nextEmail) {
      let authResult;
      try {
        authResult = await client.auth.admin.updateUserById(context.user.id, {
          email: nextEmail,
          email_confirm: true,
        });
      } catch {
        authResult = { error: true };
      }

      if (authResult.error) {
        let restored;
        try {
          restored = await client
            .from('profiles')
            .update({ admin_login: context.profile.admin_login })
            .eq('id', context.user.id)
            .eq('role', 'SUPERADMIN');
        } catch {
          restored = { error: true };
        }
        if (authResult.error?.status === 409 || authResult.error?.code === 'email_exists') {
          throw new HttpError(
            restored.error ? 500 : 409,
            restored.error
              ? 'ADMIN_LOGIN_UPDATE_RECOVERY_REQUIRED'
              : 'ADMIN_LOGIN_ALREADY_USED',
            restored.error
              ? 'A alteração ficou incompleta. Entre em contato com o suporte.'
              : 'Este login já está em uso.',
          );
        }
        throw new HttpError(
          restored.error ? 500 : 503,
          restored.error
            ? 'ADMIN_LOGIN_UPDATE_RECOVERY_REQUIRED'
            : 'ADMIN_LOGIN_UPDATE_UNAVAILABLE',
          restored.error
            ? 'A alteração ficou incompleta. Entre em contato com o suporte.'
            : 'Não foi possível atualizar o login.',
        );
      }
    }

    return jsonResponse(
      200,
      { data: { admin_login: login } },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
