function messageFor(code, fallback) {
  const messages = {
    ACCOUNT_INACTIVE: 'Esta conta está inativa.',
    ACTIVE_DIET_UNAVAILABLE: 'A dieta está temporariamente indisponível. Tente novamente.',
    FORBIDDEN: 'Esta área está disponível somente para pacientes.',
    PASSWORD_CHANGE_REQUIRED: 'Troque sua senha antes de consultar a dieta.',
    UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  };
  return messages[code] || fallback || 'Não foi possível carregar a dieta.';
}

export async function getActiveDiet({
  accessToken,
  signal,
  fetchImpl = fetch,
} = {}) {
  let response;
  try {
    response = await fetchImpl('/api/me/active-diet', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal,
    });
  } catch {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    throw new Error('Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('O serviço retornou uma resposta inválida.');
  }

  if (!response.ok) {
    throw new Error(
      messageFor(result?.error?.code, result?.error?.message),
    );
  }

  const diet = result?.data?.diet;
  if (
    diet !== null &&
    (!diet ||
      typeof diet.id !== 'string' ||
      typeof diet.title !== 'string' ||
      diet.status !== 'ACTIVE' ||
      !Array.isArray(diet.meals))
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}
