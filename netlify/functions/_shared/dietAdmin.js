import { authenticateRequest, requireAdmin } from './auth.js';
import { errorResponse, HttpError, jsonResponse } from './http.js';
import { createServerSupabaseClient } from './supabase.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MEALS = 20;
const MAX_GROUPS_PER_MEAL = 20;
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_TOTAL_OPTIONS = 200;
const MAX_NOTES_LENGTH = 5000;
const MAX_ITEM_NOTES_LENGTH = 2000;
const TIME_PATTERN =
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const DIET_FIELDS = [
  'title',
  'target_calories',
  'target_protein',
  'target_carbohydrates',
  'target_fats',
  'notes',
  'meals',
];

function invalidRequest(message = 'Confira a estrutura e os dados informados.') {
  return new HttpError(400, 'INVALID_DIET', message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertFields(value, allowedFields, requiredFields = []) {
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => !allowedFields.includes(field)) ||
    requiredFields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw invalidRequest();
  }
}

function validateText(value, maxLength, { nullable = false } = {}) {
  if (nullable && (value === undefined || value === null)) {
    return null;
  }
  if (typeof value !== 'string') {
    throw invalidRequest();
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) {
    throw invalidRequest();
  }
  return text;
}

function validateOptionalNotes(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw invalidRequest();
  }
  const notes = value.trim();
  return notes || null;
}

function validateNumber(value, { integer = false, maximum = 1000000 } = {}) {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw invalidRequest();
  }
  return value;
}

function validateOption(option) {
  assertFields(
    option,
    [
      'label',
      'food_name',
      'quantity',
      'unit',
      'calories',
      'protein',
      'carbohydrates',
      'fats',
      'notes',
    ],
    ['label', 'food_name', 'quantity', 'unit'],
  );
  return {
    label: validateText(option.label, 100),
    food_name: validateText(option.food_name, 200),
    quantity: validateNumber(option.quantity),
    unit: validateText(option.unit, 50),
    calories: validateNumber(option.calories),
    protein: validateNumber(option.protein),
    carbohydrates: validateNumber(option.carbohydrates),
    fats: validateNumber(option.fats),
    notes: validateOptionalNotes(option.notes, MAX_ITEM_NOTES_LENGTH),
  };
}

function validateFoodGroup(group, totalOptions) {
  assertFields(group, ['name', 'options'], ['name', 'options']);
  if (
    !Array.isArray(group.options) ||
    group.options.length < 1 ||
    group.options.length > MAX_OPTIONS_PER_GROUP
  ) {
    throw invalidRequest();
  }
  totalOptions.count += group.options.length;
  if (totalOptions.count > MAX_TOTAL_OPTIONS) {
    throw invalidRequest();
  }
  return {
    name: validateText(group.name, 200),
    options: group.options.map(validateOption),
  };
}

function validateMeal(meal, totalOptions) {
  assertFields(
    meal,
    ['name', 'scheduled_time', 'target_calories', 'notes', 'food_groups'],
    ['name', 'food_groups'],
  );
  if (
    !Array.isArray(meal.food_groups) ||
    meal.food_groups.length < 1 ||
    meal.food_groups.length > MAX_GROUPS_PER_MEAL
  ) {
    throw invalidRequest();
  }

  const scheduledTime =
    meal.scheduled_time === undefined || meal.scheduled_time === null
      ? null
      : meal.scheduled_time;
  if (
    scheduledTime !== null &&
    (typeof scheduledTime !== 'string' || !TIME_PATTERN.test(scheduledTime))
  ) {
    throw invalidRequest();
  }

  return {
    name: validateText(meal.name, 200),
    scheduled_time: scheduledTime,
    target_calories: validateNumber(meal.target_calories, { integer: true }),
    notes: validateOptionalNotes(meal.notes, MAX_ITEM_NOTES_LENGTH),
    food_groups: meal.food_groups.map((group) =>
      validateFoodGroup(group, totalOptions),
    ),
  };
}

export function validateDietPayload(body) {
  assertFields(body, DIET_FIELDS, ['title', 'meals']);
  if (!Array.isArray(body.meals) || body.meals.length < 1 || body.meals.length > MAX_MEALS) {
    throw invalidRequest();
  }

  const totalOptions = { count: 0 };
  return {
    title: validateText(body.title, 200),
    target_calories: validateNumber(body.target_calories, { integer: true }),
    target_protein: validateNumber(body.target_protein),
    target_carbohydrates: validateNumber(body.target_carbohydrates),
    target_fats: validateNumber(body.target_fats),
    notes: validateOptionalNotes(body.notes, MAX_NOTES_LENGTH),
    meals: body.meals.map((meal) => validateMeal(meal, totalOptions)),
  };
}

function getId(request, parameter, code, label) {
  const id = new URL(request.url).searchParams.get(parameter);
  if (!id || !UUID_PATTERN.test(id)) {
    throw new HttpError(400, code, `Identificador de ${label} inválido.`);
  }
  return id;
}

async function saveDraft(request, operation, dependencies) {
  const {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = dependencies;
  try {
    requireAdmin(await authenticate(request));
    const studentId =
      operation === 'create'
        ? getId(request, 'id', 'INVALID_PATIENT_ID', 'paciente')
        : null;
    const dietId =
      operation === 'update'
        ? getId(request, 'id', 'INVALID_DIET_ID', 'dieta')
        : null;

    let body;
    try {
      body = await request.json();
    } catch {
      throw invalidRequest('Envie uma solicitação JSON válida.');
    }
    const payload = validateDietPayload(body);

    let result;
    try {
      result = await createAdminClient().rpc('save_draft_diet', {
        p_student_id: studentId,
        p_diet_id: dietId,
        p_payload: payload,
      });
    } catch {
      throw new HttpError(
        503,
        'DIET_SAVE_UNAVAILABLE',
        'Não foi possível salvar o rascunho. Tente novamente.',
      );
    }

    if (result.error) {
      if (result.error.code === 'P0002') {
        throw new HttpError(404, 'DIET_NOT_FOUND', 'Paciente ou dieta não encontrado.');
      }
      if (result.error.code === '55000') {
        throw new HttpError(
          409,
          'DIET_NOT_DRAFT',
          'Somente dietas em rascunho podem ser editadas.',
        );
      }
      throw new HttpError(
        503,
        'DIET_SAVE_UNAVAILABLE',
        'Não foi possível salvar o rascunho. Tente novamente.',
      );
    }

    const savedDiet = result.data;
    if (
      !isRecord(savedDiet) ||
      typeof savedDiet.id !== 'string' ||
      typeof savedDiet.student_id !== 'string' ||
      !Number.isInteger(savedDiet.version)
    ) {
      throw new HttpError(
        503,
        'DIET_SAVE_UNAVAILABLE',
        'Não foi possível confirmar o salvamento do rascunho.',
      );
    }

    return jsonResponse(
      operation === 'create' ? 201 : 200,
      {
        data: {
          diet: {
            id: savedDiet.id,
            student_id: savedDiet.student_id,
            version: savedDiet.version,
            status: 'DRAFT',
          },
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export function createPatientDiet(request, dependencies = {}) {
  if (request.method === 'GET') {
    return getPatientDietHistory(request, dependencies);
  }
  if (request.method !== 'POST') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }
  return saveDraft(request, 'create', dependencies);
}

export async function getPatientDietHistory(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'GET') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    requireAdmin(await authenticate(request));
    const patientId = getId(request, 'id', 'INVALID_PATIENT_ID', 'paciente');
    const client = createAdminClient();

    let profileResult;
    try {
      profileResult = await client
        .from('profiles')
        .select('id, role')
        .eq('id', patientId)
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'DIET_HISTORY_UNAVAILABLE',
        'O histórico de dietas está temporariamente indisponível.',
      );
    }

    if (profileResult.error) {
      throw new HttpError(
        503,
        'DIET_HISTORY_UNAVAILABLE',
        'O histórico de dietas está temporariamente indisponível.',
      );
    }
    if (profileResult.data?.id !== patientId || profileResult.data.role !== 'STUDENT') {
      throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado.');
    }

    let dietsResult;
    try {
      dietsResult = await client
        .from('diets')
        .select('id, title, version, status, created_at, updated_at')
        .eq('student_id', patientId)
        .order('version', { ascending: false });
    } catch {
      throw new HttpError(
        503,
        'DIET_HISTORY_UNAVAILABLE',
        'O histórico de dietas está temporariamente indisponível.',
      );
    }
    if (dietsResult.error || !Array.isArray(dietsResult.data)) {
      throw new HttpError(
        503,
        'DIET_HISTORY_UNAVAILABLE',
        'O histórico de dietas está temporariamente indisponível.',
      );
    }

    return jsonResponse(
      200,
      {
        data: {
          diets: dietsResult.data.map((diet) => ({
            id: diet.id,
            title: diet.title,
            version: diet.version,
            status: diet.status,
            created_at: diet.created_at,
            updated_at: diet.updated_at,
          })),
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export function updateDietDraft(request, dependencies = {}) {
  if (request.method !== 'PUT') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }
  return saveDraft(request, 'update', dependencies);
}

export async function activateDietDraft(
  request,
  {
    authenticate = authenticateRequest,
    createAdminClient = createServerSupabaseClient,
  } = {},
) {
  if (request.method !== 'POST') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    requireAdmin(await authenticate(request));
    const studentId = getId(request, 'studentId', 'INVALID_PATIENT_ID', 'paciente');
    const dietId = getId(request, 'dietId', 'INVALID_DIET_ID', 'dieta');

    let result;
    try {
      result = await createAdminClient().rpc('activate_draft_diet', {
        p_student_id: studentId,
        p_diet_id: dietId,
      });
    } catch {
      throw new HttpError(
        503,
        'DIET_ACTIVATION_UNAVAILABLE',
        'Não foi possível confirmar a ativação. Atualize o histórico antes de tentar novamente.',
      );
    }

    if (result.error) {
      if (result.error.code === 'P0002') {
        throw new HttpError(404, 'DIET_NOT_FOUND', 'Paciente ou dieta não encontrado.');
      }
      if (result.error.code === '55000') {
        throw new HttpError(
          409,
          'DIET_NOT_DRAFT',
          'Somente rascunhos deste paciente podem ser ativados.',
        );
      }
      throw new HttpError(
        503,
        'DIET_ACTIVATION_UNAVAILABLE',
        'Não foi possível confirmar a ativação. Atualize o histórico antes de tentar novamente.',
      );
    }

    if (
      !result.data ||
      result.data.id !== dietId ||
      result.data.student_id !== studentId ||
      result.data.status !== 'ACTIVE' ||
      !Number.isInteger(result.data.version)
    ) {
      throw new HttpError(
        503,
        'DIET_ACTIVATION_UNAVAILABLE',
        'Não foi possível confirmar a ativação. Atualize o histórico.',
      );
    }

    return jsonResponse(
      200,
      {
        data: {
          diet: {
            id: result.data.id,
            student_id: result.data.student_id,
            version: result.data.version,
            status: result.data.status,
            previous_active_id: result.data.previous_active_id ?? null,
          },
        },
      },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
