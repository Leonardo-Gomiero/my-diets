import {
  authenticateRequest,
  requirePasswordChangeComplete,
  requireRole,
} from './_shared/auth.js';
import { errorResponse, HttpError, jsonResponse } from './_shared/http.js';
import { createAuthenticatedSupabaseClient } from './_shared/supabase.js';

function ordered(items) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((left, right) => left.order_index - right.order_index)
    .map((item) => {
      if (Array.isArray(item.food_groups)) {
        return {
          ...item,
          food_groups: ordered(item.food_groups),
        };
      }
      if (Array.isArray(item.food_options)) {
        return {
          ...item,
          food_options: ordered(item.food_options),
        };
      }
      return item;
    });
}

function toDiet(diet, userId) {
  if (!diet) return null;
  if (diet.student_id !== userId || diet.status !== 'ACTIVE') {
    throw new HttpError(
      503,
      'ACTIVE_DIET_UNAVAILABLE',
      'Não foi possível confirmar a dieta ativa.',
    );
  }

  return {
    id: diet.id,
    title: diet.title,
    version: diet.version,
    status: diet.status,
    target_calories: diet.target_calories,
    target_protein: diet.target_protein,
    target_carbohydrates: diet.target_carbohydrates,
    target_fats: diet.target_fats,
    notes: diet.notes,
    meals: ordered(diet.meals).map((meal) => ({
      id: meal.id,
      order_index: meal.order_index,
      name: meal.name,
      scheduled_time: meal.scheduled_time,
      target_calories: meal.target_calories,
      notes: meal.notes,
      food_groups: ordered(meal.food_groups).map((group) => ({
        id: group.id,
        order_index: group.order_index,
        name: group.name,
        food_options: ordered(group.food_options).map((option) => ({
          id: option.id,
          order_index: option.order_index,
          label: option.label,
          food_name: option.food_name,
          quantity: option.quantity,
          unit: option.unit,
          calories: option.calories,
          protein: option.protein,
          carbohydrates: option.carbohydrates,
          fats: option.fats,
          notes: option.notes,
        })),
      })),
    })),
  };
}

export default async function meActiveDiet(
  request,
  {
    authenticate = authenticateRequest,
    createUserClient = createAuthenticatedSupabaseClient,
  } = {},
) {
  if (request.method !== 'GET') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'),
    );
  }

  try {
    const context = await authenticate(request);
    requireRole(context, 'STUDENT');
    requirePasswordChangeComplete(context);

    const authorization = request.headers.get('authorization') ?? '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    if (!accessToken) {
      throw new HttpError(
        401,
        'UNAUTHENTICATED',
        'Uma sessão válida é necessária.',
      );
    }

    let result;
    try {
      result = await createUserClient(accessToken)
        .from('diets')
        .select(`
          id, student_id, title, version, status,
          target_calories, target_protein, target_carbohydrates, target_fats, notes,
          meals (
            id, order_index, name, scheduled_time, target_calories, notes,
            food_groups (
              id, order_index, name,
              food_options (
                id, order_index, label, food_name, quantity, unit,
                calories, protein, carbohydrates, fats, notes
              )
            )
          )
        `)
        .eq('student_id', context.user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();
    } catch {
      throw new HttpError(
        503,
        'ACTIVE_DIET_UNAVAILABLE',
        'A dieta está temporariamente indisponível.',
      );
    }

    if (result.error) {
      throw new HttpError(
        503,
        'ACTIVE_DIET_UNAVAILABLE',
        'A dieta está temporariamente indisponível.',
      );
    }

    return jsonResponse(
      200,
      { data: { diet: toDiet(result.data, context.user.id) } },
      { 'Cache-Control': 'no-store, private' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
