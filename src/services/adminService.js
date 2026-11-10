const API_ERROR_MESSAGES = {
  ADMIN_LOGIN_ALREADY_USED: 'Este login já está em uso.',
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já está cadastrado.',
  FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
  INVALID_EMAIL: 'Informe um e-mail válido.',
  INVALID_FULL_NAME: 'Informe o nome completo.',
  INVALID_PHONE: 'Confira o WhatsApp informado.',
  INVALID_STATUS: 'Informe um status válido.',
  NUTRITIONIST_NOT_FOUND: 'Nutricionista não encontrado.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
};

async function requestApi(path, { accessToken, fetchImpl = fetch, ...options }) {
  let response;
  try {
    response = await fetchImpl(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Não foi possível conectar ao serviço. Tente novamente.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  if (!response.ok) {
    const apiError = result?.error;
    throw new Error(
      API_ERROR_MESSAGES[apiError?.code] ||
        apiError?.message ||
        'Não foi possível concluir a operação.',
    );
  }
  if (!result?.data) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.data;
}

export async function getNutritionists(
  { search = '', accessToken, signal, fetchImpl = fetch } = {},
) {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  const suffix = query.size ? `?${query}` : '';
  const result = await requestApi(`/api/nutritionists${suffix}`, {
    accessToken,
    fetchImpl,
    signal,
  });
  if (!Array.isArray(result.nutritionists)) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.nutritionists;
}

export async function createNutritionist(
  nutritionist,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestApi('/api/nutritionists', {
    accessToken,
    fetchImpl,
    method: 'POST',
    body: JSON.stringify(nutritionist),
  });
  if (
    !result.nutritionist ||
    typeof result.temporary_password !== 'string'
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result;
}

export async function updateNutritionist(
  id,
  nutritionist,
  { accessToken, fetchImpl = fetch } = {},
) {
  const query = new URLSearchParams({ id });
  const result = await requestApi(`/api/nutritionists?${query}`, {
    accessToken,
    fetchImpl,
    method: 'PUT',
    body: JSON.stringify(nutritionist),
  });
  if (!result.nutritionist) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.nutritionist;
}

export async function setNutritionistActive(
  id,
  isActive,
  { accessToken, fetchImpl = fetch } = {},
) {
  const query = new URLSearchParams({ id });
  const result = await requestApi(`/api/nutritionists?${query}`, {
    accessToken,
    fetchImpl,
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!result.nutritionist || result.nutritionist.is_active !== isActive) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.nutritionist;
}

export async function updateAdminLogin(
  login,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestApi('/api/me/login', {
    accessToken,
    fetchImpl,
    method: 'PUT',
    body: JSON.stringify({ login }),
  });
  if (typeof result.admin_login !== 'string') {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.admin_login;
}
