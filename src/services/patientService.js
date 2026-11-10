const API_ERROR_MESSAGES = {
  ACCOUNT_INACTIVE: 'Esta conta está inativa.',
  AUTHENTICATION_UNAVAILABLE: 'O serviço de autenticação está indisponível. Tente novamente.',
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já está cadastrado.',
  FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
  INTERNAL_ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
  INVALID_EMAIL: 'Informe um e-mail válido.',
  INVALID_FULL_NAME: 'Informe o nome completo (até 200 caracteres).',
  INVALID_PHONE: 'Confira o telefone informado.',
  INVALID_REQUEST: 'Confira os dados informados e tente novamente.',
  INVALID_PATIENT_ID: 'Identificador de paciente inválido.',
  INVALID_STATUS: 'Informe um status válido.',
  INVALID_SEARCH: 'A busca deve ter no máximo 100 caracteres.',
  METHOD_NOT_ALLOWED: 'Esta operação não está disponível.',
  PATIENT_CREATION_RECOVERY_REQUIRED:
    'O cadastro não foi concluído e a recuperação da conta precisa ser verificada pelo suporte.',
  PATIENT_CREATION_UNAVAILABLE: 'A criação da conta está temporariamente indisponível.',
  PATIENT_LIST_UNAVAILABLE: 'A lista de pacientes está temporariamente indisponível.',
  PATIENT_LOOKUP_UNAVAILABLE:
    'Os dados do paciente estão temporariamente indisponíveis.',
  PATIENT_NOT_FOUND: 'Paciente não encontrado.',
  PATIENT_PASSWORD_LOCK_FAILED:
    'Não foi possível bloquear o acesso normal da conta. A senha não foi alterada.',
  PATIENT_PASSWORD_RESET_PENDING:
    'A conta está bloqueada para a troca de senha, mas a redefinição precisa ser confirmada. Tente redefinir novamente.',
  PATIENT_PROFILE_CREATION_FAILED:
    'Não foi possível concluir o cadastro. Tente novamente.',
  PATIENT_STATUS_UPDATE_UNAVAILABLE:
    'Não foi possível atualizar o status do paciente.',
  PATIENT_UPDATE_RECOVERY_REQUIRED:
    'A atualização ficou incompleta e não pôde ser revertida. Entre em contato com o suporte.',
  PATIENT_UPDATE_UNAVAILABLE: 'Não foi possível atualizar os dados do paciente.',
  PROFILE_LOOKUP_UNAVAILABLE:
    'Não foi possível verificar sua conta. Tente novamente.',
  PROFILE_NOT_FOUND: 'O acesso desta conta ainda não foi configurado.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
};

async function requestPatientApi(
  path,
  { accessToken, fetchImpl = fetch, ...options },
) {
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
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
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

export async function getPatients(
  { search = '', accessToken, signal, fetchImpl = fetch } = {},
) {
  const query = new URLSearchParams();
  if (search.trim()) {
    query.set('search', search.trim());
  }

  const suffix = query.size ? `?${query.toString()}` : '';
  const result = await requestPatientApi(`/api/patients${suffix}`, {
    accessToken,
    fetchImpl,
    signal,
  });

  if (!Array.isArray(result.patients)) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }

  return result.patients;
}

export async function createPatient(
  patient,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestPatientApi('/api/patients', {
    accessToken,
    fetchImpl,
    method: 'POST',
    body: JSON.stringify(patient),
  });

  if (
    !result.patient ||
    typeof result.temporary_password !== 'string' ||
    !result.temporary_password
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }

  return result;
}

export async function getPatient(
  patientId,
  { accessToken, signal, fetchImpl = fetch } = {},
) {
  const result = await requestPatientApi(
    `/api/patients/${encodeURIComponent(patientId)}`,
    { accessToken, fetchImpl, signal },
  );
  if (!result.patient) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.patient;
}

export async function updatePatient(
  patientId,
  patient,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestPatientApi(
    `/api/patients/${encodeURIComponent(patientId)}`,
    {
      accessToken,
      fetchImpl,
      method: 'PUT',
      body: JSON.stringify(patient),
    },
  );
  if (!result.patient) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.patient;
}

export async function updatePatientStatus(
  patientId,
  isActive,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestPatientApi(
    `/api/patients/${encodeURIComponent(patientId)}/status`,
    {
      accessToken,
      fetchImpl,
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    },
  );
  if (!result.patient || result.patient.is_active !== isActive) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result.patient;
}

export async function resetPatientPassword(
  patientId,
  { accessToken, fetchImpl = fetch } = {},
) {
  const result = await requestPatientApi(
    `/api/patients/${encodeURIComponent(patientId)}/temporary-password`,
    {
      accessToken,
      fetchImpl,
      method: 'POST',
    },
  );
  if (
    !result.patient ||
    typeof result.temporary_password !== 'string' ||
    !result.temporary_password
  ) {
    throw new Error('O serviço retornou uma resposta inválida.');
  }
  return result;
}
