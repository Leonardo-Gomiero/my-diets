import {
  authenticateRequest,
  requireSuperAdmin,
} from './_shared/auth.js';
import {
  errorResponse,
  HttpError,
  jsonResponse,
} from './_shared/http.js';
import { createServerSupabaseClient } from './_shared/supabase.js';
import { generateTemporaryPassword } from './_shared/temporaryPassword.js';

const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getNutritionistId(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) {
    throw new HttpError(
      400,
      'INVALID_NUTRITIONIST_ID',
      'Identificador de nutricionista inválido.',
    );
  }
  return id;
}

export default async function resetNutritionistPassword(
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
    requireSuperAdmin(await authenticate(request));
    const nutritionistId = getNutritionistId(request);
    const client = createAdminClient();

    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .select('id, full_name, role, is_active')
        .eq('id', nutritionistId)
        .eq('role', 'ADMIN')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'NUTRITIONIST_LOOKUP_UNAVAILABLE',
        'Não foi possível verificar o cadastro do nutricionista.',
      );
    }

    if (profileResult.error) {
      throw new HttpError(
        503,
        'NUTRITIONIST_LOOKUP_UNAVAILABLE',
        'Não foi possível verificar o cadastro do nutricionista.',
      );
    }
    if (!profileResult.data) {
      throw new HttpError(404, 'NUTRITIONIST_NOT_FOUND', 'Nutricionista não encontrado.');
    }
    if (profileResult.data.is_active !== true) {
      throw new HttpError(
        403,
        'ACCOUNT_INACTIVE',
        'Reative o nutricionista antes de redefinir a senha.',
      );
    }

    let authUserResult;
    try {
      authUserResult = await client.auth.admin.getUserById(nutritionistId);
    } catch {
      throw new HttpError(
        503,
        'NUTRITIONIST_LOOKUP_UNAVAILABLE',
        'Não foi possível verificar o acesso do nutricionista.',
      );
    }
    if (authUserResult.error || !authUserResult.data?.user) {
      throw new HttpError(
        503,
        'NUTRITIONIST_LOOKUP_UNAVAILABLE',
        'Não foi possível verificar o acesso do nutricionista.',
      );
    }

    const temporaryPassword = createPassword();
    let lockResult;
    try {
      lockResult = await client
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', nutritionistId)
        .eq('role', 'ADMIN')
        .eq('is_active', true)
        .select('id, must_change_password')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'NUTRITIONIST_PASSWORD_LOCK_FAILED',
        'Não foi possível bloquear o acesso até a troca de senha. A senha não foi alterada.',
      );
    }

    if (
      lockResult.error ||
      lockResult.data?.id !== nutritionistId ||
      lockResult.data.must_change_password !== true
    ) {
      throw new HttpError(
        503,
        'NUTRITIONIST_PASSWORD_LOCK_FAILED',
        'Não foi possível bloquear o acesso até a troca de senha. A senha não foi alterada.',
      );
    }

    let authResult;
    try {
      authResult = await client.auth.admin.updateUserById(nutritionistId, {
        password: temporaryPassword,
      });
    } catch {
      throw new HttpError(
        503,
        'NUTRITIONIST_PASSWORD_RESET_PENDING',
        'O acesso está bloqueado até a troca de senha, mas a redefinição não foi confirmada. Tente gerar outra senha.',
      );
    }
    if (authResult.error) {
      throw new HttpError(
        503,
        'NUTRITIONIST_PASSWORD_RESET_PENDING',
        'O acesso está bloqueado até a troca de senha, mas a redefinição não foi confirmada. Tente gerar outra senha.',
      );
    }

    let confirmation;
    try {
      confirmation = await client
        .from('profiles')
        .select('id, role, is_active, must_change_password')
        .eq('id', nutritionistId)
        .maybeSingle();
    } catch {
      confirmation = { error: true };
    }
    if (
      confirmation.error ||
      confirmation.data?.id !== nutritionistId ||
      confirmation.data.role !== 'ADMIN' ||
      confirmation.data.is_active !== true ||
      confirmation.data.must_change_password !== true
    ) {
      throw new HttpError(
        503,
        'NUTRITIONIST_PASSWORD_RESET_PENDING',
        'A senha foi atualizada, mas não foi possível confirmar a troca obrigatória. O acesso continua bloqueado; gere outra senha.',
      );
    }

    return jsonResponse(
      200,
      {
        data: {
          nutritionist: {
            id: nutritionistId,
            full_name: profileResult.data.full_name,
            email: authResult.data?.user?.email ?? authUserResult.data.user.email,
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
