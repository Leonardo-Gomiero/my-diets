import { describe, expect, it, vi } from 'vitest';
import meActiveDiet from './me-active-diet.js';
import { HttpError } from './_shared/http.js';

const STUDENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_STUDENT_ID = '123e4567-e89b-42d3-a456-426614174001';

function request(path = '/api/me/active-diet', method = 'GET', authorization = 'Bearer verified-student-token') {
  return new Request(`https://example.test${path}`, {
    method,
    headers: authorization ? { authorization } : {},
  });
}

function activeContext({
  userId = STUDENT_ID,
  role = 'STUDENT',
  active = true,
  mustChangePassword = false,
} = {}) {
  return {
    user: { id: userId },
    profile: {
      id: userId,
      role,
      is_active: active,
      must_change_password: mustChangePassword,
    },
  };
}

function queryClient(result) {
  const filters = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((field, value) => {
      filters.push([field, value]);
      return query;
    }),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return {
    client: { from: vi.fn(() => query) },
    query,
    filters,
  };
}

function dietFor(studentId = STUDENT_ID) {
  return {
    id: 'diet-1',
    student_id: studentId,
    title: 'Plano ativo',
    version: 3,
    status: 'ACTIVE',
    target_calories: 1800,
    target_protein: 100,
    target_carbohydrates: 200,
    target_fats: 60,
    notes: 'Observação geral',
    meals: [
      {
        id: 'meal-late',
        order_index: 1,
        name: 'Almoço',
        scheduled_time: '12:00:00',
        target_calories: 700,
        notes: null,
        food_groups: [
          {
            id: 'group-2',
            order_index: 1,
            name: 'Legumes',
            food_options: [
              {
                id: 'option-2',
                order_index: 1,
                label: 'Opção B',
                food_name: 'Abobrinha',
                quantity: 100,
                unit: 'g',
                calories: null,
                protein: null,
                carbohydrates: null,
                fats: null,
                notes: null,
              },
            ],
          },
          {
            id: 'group-1',
            order_index: 0,
            name: 'Proteína',
            food_options: [
              {
                id: 'option-1',
                order_index: 0,
                label: 'Opção A',
                food_name: 'Frango',
                quantity: 120,
                unit: 'g',
                calories: 198,
                protein: 36,
                carbohydrates: 0,
                fats: 4,
                notes: 'Grelhado',
              },
            ],
          },
        ],
      },
      {
        id: 'meal-first',
        order_index: 0,
        name: 'Café da manhã',
        scheduled_time: '08:00:00',
        target_calories: null,
        notes: 'Nota da refeição',
        food_groups: [],
      },
    ],
  };
}

describe('GET /api/me/active-diet', () => {
  it('uses the verified student identity and returns only their active ordered diet', async () => {
    const { client, filters, query } = queryClient({
      data: dietFor(),
      error: null,
    });
    const createUserClient = vi.fn(() => client);
    const response = await meActiveDiet(
      request('/api/me/active-diet?studentId=attacker-id'),
      {
        authenticate: vi.fn().mockResolvedValue(activeContext()),
        createUserClient,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(createUserClient).toHaveBeenCalledWith('verified-student-token');
    expect(client.from).toHaveBeenCalledWith('diets');
    expect(filters).toEqual([
      ['student_id', STUDENT_ID],
      ['status', 'ACTIVE'],
    ]);
    expect(query.select.mock.calls[0][0]).toContain('food_options');
    const body = await response.json();
    expect(body.data.diet.student_id).toBeUndefined();
    expect(body.data.diet.meals.map(({ name }) => name)).toEqual([
      'Café da manhã',
      'Almoço',
    ]);
    expect(body.data.diet.meals[1].food_groups.map(({ name }) => name)).toEqual([
      'Proteína',
      'Legumes',
    ]);
    expect(body.data.diet.meals[1].food_groups[0].food_options[0].food_name)
      .toBe('Frango');
    expect(JSON.stringify(body)).not.toContain('attacker-id');
  });

  it('returns null when the authenticated student has no active diet', async () => {
    const { client } = queryClient({ data: null, error: null });
    const response = await meActiveDiet(request(), {
      authenticate: vi.fn().mockResolvedValue(activeContext()),
      createUserClient: () => client,
    });
    await expect(response.json()).resolves.toEqual({ data: { diet: null } });
  });

  it.each([
    [activeContext({ active: false, mustChangePassword: true }), 'ACCOUNT_INACTIVE'],
    [activeContext({ mustChangePassword: true }), 'PASSWORD_CHANGE_REQUIRED'],
    [activeContext({ role: 'ADMIN' }), 'FORBIDDEN'],
  ])('does not query diet data for an ineligible account (%s)', async (context, code) => {
    const createUserClient = vi.fn();
    const response = await meActiveDiet(request(), {
      authenticate: vi.fn().mockResolvedValue(context),
      createUserClient,
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe(code);
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it('rejects a result whose owner does not match the verified identity', async () => {
    const { client } = queryClient({
      data: dietFor(OTHER_STUDENT_ID),
      error: null,
    });
    const response = await meActiveDiet(request(), {
      authenticate: vi.fn().mockResolvedValue(activeContext()),
      createUserClient: () => client,
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('ACTIVE_DIET_UNAVAILABLE');
  });

  it('requires authentication and GET', async () => {
    const createUserClient = vi.fn();
    const denied = await meActiveDiet(request('/api/me/active-diet', 'GET'), {
      authenticate: vi.fn().mockRejectedValue(
        new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'),
      ),
      createUserClient,
    });
    expect(denied.status).toBe(401);
    expect(createUserClient).not.toHaveBeenCalled();

    const wrongMethod = await meActiveDiet(request('/api/me/active-diet', 'POST'), {
      authenticate: vi.fn(),
      createUserClient,
    });
    expect(wrongMethod.status).toBe(405);
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it('returns a safe error if the RLS-scoped query is unavailable', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'private database error' },
      }),
    };
    const response = await meActiveDiet(request(), {
      authenticate: vi.fn().mockResolvedValue(activeContext()),
      createUserClient: () => ({ from: () => query }),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('private database error');
  });
});
