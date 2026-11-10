function apiErrorMessage(code, message) {
  const messages = {
    DIET_NOT_DRAFT: 'Não foi possível editar esta dieta.',
    DIET_NOT_ACTIVATABLE: 'Somente rascunhos ou dietas arquivadas podem ser ativados.',
    DIET_NOT_FOUND: 'Dieta não encontrada.',
    DIET_SAVE_UNAVAILABLE: 'Não foi possível salvar a dieta. Tente novamente.',
    DIET_LOOKUP_UNAVAILABLE: 'A dieta está temporariamente indisponível.',
    DIET_HISTORY_UNAVAILABLE: 'As dietas estão temporariamente indisponíveis.',
    DIET_ACTIVATION_UNAVAILABLE: 'Não foi possível confirmar a ativação. Atualize a página de dietas antes de tentar novamente.',
    DIET_DUPLICATE_UNAVAILABLE: 'Não foi possível duplicar a dieta. Tente novamente.',
    DIET_DELETE_UNAVAILABLE: 'Não foi possível excluir a dieta. Tente novamente.',
    PATIENT_NOT_FOUND: 'Paciente não encontrado.',
    FORBIDDEN: 'Você não tem permissão para editar dietas.',
    INVALID_DIET: 'Confira os dados da dieta e tente novamente.',
    INVALID_PATIENT_ID: 'Paciente inválido.',
    INVALID_DIET_ID: 'Dieta inválida.',
    UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  };
  return messages[code] || message || 'Não foi possível salvar a dieta.';
}

async function saveDiet(path, method, payload, { accessToken, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    throw new Error(
      apiErrorMessage(result?.error?.code, result?.error?.message),
    );
  }

  const diet = result?.data?.diet;
  if (
    !diet ||
    typeof diet.id !== 'string' ||
    typeof diet.student_id !== 'string' ||
    !Number.isInteger(diet.version) ||
    !['DRAFT', 'ACTIVE'].includes(diet.status)
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}

export function createDiet(patientId, payload, options) {
  return saveDiet(
    `/api/patients/${encodeURIComponent(patientId)}/diets`,
    'POST',
    payload,
    options,
  );
}

export function updateDiet(dietId, payload, options) {
  return saveDiet(
    `/api/diets/${encodeURIComponent(dietId)}`,
    'PUT',
    payload,
    options,
  );
}

export async function getDiet(dietId, { accessToken, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`/api/diets/${encodeURIComponent(dietId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
    throw new Error(apiErrorMessage(result?.error?.code, result?.error?.message));
  }

  const diet = result?.data?.diet;
  if (
    !diet ||
    diet.id !== dietId ||
    typeof diet.student_id !== 'string' ||
    !Number.isInteger(diet.version) ||
    !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(diet.status) ||
    !Array.isArray(diet.meals)
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}

export async function getDietHistory(patientId, { accessToken, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(
      `/api/patients/${encodeURIComponent(patientId)}/diets`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      },
    );
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
    throw new Error(
      apiErrorMessage(result?.error?.code, result?.error?.message),
    );
  }
  if (!Array.isArray(result?.data?.diets)) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.data.diets;
}

export async function activateDiet(
  patientId,
  dietId,
  { accessToken, fetchImpl = fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl(
      `/api/patients/${encodeURIComponent(patientId)}/diets/${encodeURIComponent(dietId)}/activate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      },
    );
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
    throw new Error(
      apiErrorMessage(result?.error?.code, result?.error?.message),
    );
  }

  const diet = result?.data?.diet;
  if (
    !diet ||
    diet.id !== dietId ||
    diet.student_id !== patientId ||
    diet.status !== 'ACTIVE' ||
    !Number.isInteger(diet.version)
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}

export async function duplicateDiet(
  dietId,
  { accessToken, fetchImpl = fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl(`/api/diets/${encodeURIComponent(dietId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
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
    throw new Error(apiErrorMessage(result?.error?.code, result?.error?.message));
  }

  const diet = result?.data?.diet;
  if (
    !diet ||
    typeof diet.id !== 'string' ||
    typeof diet.student_id !== 'string' ||
    !Number.isInteger(diet.version) ||
    diet.status !== 'DRAFT'
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}

export async function deleteDiet(
  dietId,
  { accessToken, fetchImpl = fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl(`/api/diets/${encodeURIComponent(dietId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
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
    throw new Error(apiErrorMessage(result?.error?.code, result?.error?.message));
  }
  if (result?.data?.id !== dietId) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
}
