function apiErrorMessage(code, message) {
  const messages = {
    DIET_NOT_DRAFT: 'Somente rascunhos podem ser editados.',
    DIET_NOT_FOUND: 'O rascunho não foi encontrado.',
    DIET_SAVE_UNAVAILABLE: 'Não foi possível salvar o rascunho. Tente novamente.',
    FORBIDDEN: 'Você não tem permissão para editar dietas.',
    INVALID_DIET: 'Confira os dados da dieta e tente novamente.',
    INVALID_PATIENT_ID: 'Paciente inválido.',
    INVALID_DIET_ID: 'Rascunho inválido.',
    UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  };
  return messages[code] || message || 'Não foi possível salvar o rascunho.';
}

async function saveDraft(path, method, payload, { accessToken, fetchImpl = fetch } = {}) {
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
    diet.status !== 'DRAFT'
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return diet;
}

export function createDietDraft(patientId, payload, options) {
  return saveDraft(
    `/api/patients/${encodeURIComponent(patientId)}/diets`,
    'POST',
    payload,
    options,
  );
}

export function updateDietDraft(dietId, payload, options) {
  return saveDraft(
    `/api/diets/${encodeURIComponent(dietId)}`,
    'PUT',
    payload,
    options,
  );
}
