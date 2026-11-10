const API_ERROR_MESSAGES = {
  INVALID_FULL_NAME: 'Informe seu nome completo (até 200 caracteres).',
  INVALID_PHONE: 'Confira o WhatsApp informado.',
  INVALID_REQUEST: 'Confira os dados informados e tente novamente.',
  PROFILE_UPDATE_RECOVERY_REQUIRED:
    'A atualização ficou incompleta e não pôde ser revertida. Entre em contato com o suporte.',
  PROFILE_UPDATE_UNAVAILABLE:
    'Não foi possível atualizar seu perfil. Tente novamente.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
};

export async function updateNutritionistProfile(
  profile,
  { accessToken, fetchImpl = fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl('/api/me/profile', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(profile),
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
        'Não foi possível atualizar seu perfil.',
    );
  }

  const updatedProfile = result?.data?.profile;
  if (
    !updatedProfile ||
    typeof updatedProfile.id !== 'string' ||
    typeof updatedProfile.full_name !== 'string'
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }

  return updatedProfile;
}
