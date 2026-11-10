import { getSupabaseClient } from './supabaseClient.js';

const VALID_ROLES = new Set(['ADMIN', 'STUDENT']);

function authenticationError() {
  return new Error('E-mail ou senha incorretos.');
}

export async function getApplicationProfile(
  session,
  { fetchImpl = fetch } = {},
) {
  if (!session?.access_token || !session.user?.id) {
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  }

  let response;
  try {
    response = await fetchImpl('/api/me', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    throw new Error('Não foi possível verificar sua conta agora. Tente novamente.');
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
      throw new Error('Não foi possível verificar sua conta. Entre em contato com o suporte.');
    }

    throw new Error('Não foi possível verificar sua conta agora. Tente novamente.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('O serviço de contas retornou uma resposta inválida.');
  }

  const profile = result?.data?.profile;

  if (
    !profile ||
    profile.id !== session.user.id ||
    !VALID_ROLES.has(profile.role) ||
    profile.is_active !== true
  ) {
    throw new Error('Não foi possível verificar sua conta. Entre em contato com o suporte.');
  }

  return { profile, mustChangePassword: false };
}

async function revokeSession(client) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    throw new Error('Não foi possível encerrar a sessão atual.');
  }
}

async function clearRejectedSession(client, verificationError) {
  try {
    await revokeSession(client);
  } catch {
    throw new Error(
      'Não foi possível encerrar sua sessão. Feche esta janela do navegador e entre em contato com o suporte.',
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
    throw new Error('Informe seu e-mail e sua senha para continuar.');
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
    throw new Error('Não foi possível restaurar sua sessão. Entre novamente.');
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
  { client = getSupabaseClient(), fetchImpl = fetch } = {},
) {
  if (!session?.access_token || !session.user?.email) {
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  }

  async function recoverUpdatedPassword() {
    const { data, error } = await client.auth.signInWithPassword({
      email: session.user.email,
      password,
    });

    if (error || !data?.session) {
      return null;
    }

    const applicationState = await getApplicationProfile(data.session, { fetchImpl });
    return { ...applicationState, session: data.session };
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
    const updatedState = await recoverUpdatedPassword();
    if (updatedState && !updatedState.mustChangePassword && updatedState.profile) {
      return updatedState;
    }
    throw new Error('Não foi possível concluir a troca de senha. Envie novamente para tentar com segurança.');
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    if (errorBody?.error?.code === 'PASSWORD_PROFILE_UPDATE_PENDING') {
      const updatedState = await recoverUpdatedPassword();
      if (updatedState?.mustChangePassword) {
        throw new Error(
          'Sua senha foi alterada, mas a configuração da conta ainda está pendente. Informe uma nova senha para tentar novamente com segurança.',
        );
      }
      if (updatedState?.profile) {
        return updatedState;
      }
    }

    if (errorBody?.error?.code === 'INVALID_PASSWORD') {
      throw new Error(errorBody.error.message);
    }

    const updatedState = await recoverUpdatedPassword();
    if (updatedState && !updatedState.mustChangePassword && updatedState.profile) {
      return updatedState;
    }

    throw new Error('Não foi possível concluir a troca de senha. Envie novamente para tentar com segurança.');
  }

  const updatedState = await recoverUpdatedPassword();
  if (!updatedState || updatedState.mustChangePassword || !updatedState.profile) {
    throw new Error('A troca de senha ainda não foi confirmada. Tente novamente.');
  }

  return updatedState;
}

export async function signOut({ client = getSupabaseClient() } = {}) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    throw new Error('Não foi possível encerrar a sessão atual.');
  }
}
