import { describe, expect, it, vi } from 'vitest';
import {
  activateDietDraft,
  createPatientDiet,
  getPatientDietHistory,
  updateDietDraft,
} from './_shared/dietAdmin.js';
import { HttpError } from './_shared/http.js';

const PATIENT_ID = '123e4567-e89b-42d3-a456-426614174000';
const DIET_ID = '123e4567-e89b-42d3-a456-426614174001';

function request(path, body, method) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: { id: 'admin-id', role, is_active: true },
  };
}

function dietPayload() {
  return {
    title: 'Plano semanal',
    target_calories: 2000,
    target_protein: 120,
    target_carbohydrates: 220,
    target_fats: 60,
    notes: 'Observações gerais',
    meals: [
      {
        name: 'Café da manhã',
        scheduled_time: '08:00',
        target_calories: 500,
        notes: null,
        food_groups: [
          {
            name: 'Proteína',
            options: [
              {
                label: 'Opção A',
                food_name: 'Ovos',
                quantity: 2,
                unit: 'unidade',
                calories: 140,
                protein: 12,
                carbohydrates: 1,
                fats: 10,
                notes: null,
              },
              {
                label: 'Opção B',
                food_name: 'Iogurte',
                quantity: 170,
                unit: 'g',
                calories: null,
                protein: null,
                carbohydrates: null,
                fats: null,
                notes: 'Natural',
              },
            ],
          },
        ],
      },
      {
        name: 'Almoço',
        food_groups: [
          {
            name: 'Carboidrato',
            options: [
              {
                label: 'Opção A',
                food_name: 'Arroz',
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
        ],
        scheduled_time: null,
        target_calories: null,
        notes: null,
      },
    ],
  };
}

function setup({ data = { id: DIET_ID, student_id: PATIENT_ID, version: 3 }, error = null } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const createAdminClient = vi.fn(() => ({ rpc }));
  const authenticate = vi.fn().mockResolvedValue(adminContext());
  return { rpc, createAdminClient, authenticate };
}

describe('draft diet endpoints', () => {
  it('creates the entire ordered diet tree through one atomic RPC', async () => {
    const dependencies = setup();
    const response = await createPatientDiet(
      request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, dietPayload(), 'POST'),
      dependencies,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    await expect(response.json()).resolves.toEqual({
      data: {
        diet: {
          id: DIET_ID,
          student_id: PATIENT_ID,
          version: 3,
          status: 'DRAFT',
        },
      },
    });
    expect(dependencies.rpc).toHaveBeenCalledOnce();
    expect(dependencies.rpc).toHaveBeenCalledWith('save_draft_diet', {
      p_student_id: PATIENT_ID,
      p_diet_id: null,
      p_payload: dietPayload(),
    });
  });

  describe('diet history and activation endpoints', () => {
      it('returns only the selected patient diet history, ordered by version', async () => {
        const patientQuery = {
          select: vi.fn(() => patientQuery),
          eq: vi.fn(() => patientQuery),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: PATIENT_ID, role: 'STUDENT' },
            error: null,
          }),
        };
        const history = [
          { id: 'diet-2', title: 'Plano atualizado', version: 2, status: 'DRAFT' },
          { id: 'diet-1', title: 'Plano anterior', version: 1, status: 'ACTIVE' },
        ];
        const dietsQuery = {
          select: vi.fn(() => dietsQuery),
          eq: vi.fn(() => dietsQuery),
          order: vi.fn().mockResolvedValue({ data: history, error: null }),
        };
        const from = vi.fn((table) => table === 'profiles' ? patientQuery : dietsQuery);
        const response = await getPatientDietHistory(
          request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, undefined, 'GET'),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({ from }),
          },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store, private');
        await expect(response.json()).resolves.toEqual({ data: { diets: history } });
        expect(patientQuery.eq).toHaveBeenCalledWith('id', PATIENT_ID);
        expect(dietsQuery.eq).toHaveBeenCalledWith('student_id', PATIENT_ID);
        expect(dietsQuery.order).toHaveBeenCalledWith('version', { ascending: false });
      });

      it('requires an admin and a student profile for history reads', async () => {
        const createAdminClient = vi.fn();
        const denied = await getPatientDietHistory(
          request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, undefined, 'GET'),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
            createAdminClient,
          },
        );
        expect(denied.status).toBe(403);
        expect(createAdminClient).not.toHaveBeenCalled();

        const missingPatient = await getPatientDietHistory(
          request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, undefined, 'GET'),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({
              from: () => ({
                select: () => ({
                  eq: () => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: PATIENT_ID, role: 'ADMIN' },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          },
        );
        expect(missingPatient.status).toBe(404);
      });

      it('activates a draft through the single atomic activation RPC', async () => {
        const rpc = vi.fn().mockResolvedValue({
          data: {
            id: DIET_ID,
            student_id: PATIENT_ID,
            version: 3,
            status: 'ACTIVE',
            previous_active_id: 'old-active-id',
          },
          error: null,
        });
        const response = await activateDietDraft(
          request(
            `/.netlify/functions/patient-diet-activate?studentId=${PATIENT_ID}&dietId=${DIET_ID}`,
            undefined,
            'POST',
          ),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({ rpc }),
          },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
          data: {
            diet: {
              id: DIET_ID,
              student_id: PATIENT_ID,
              version: 3,
              status: 'ACTIVE',
              previous_active_id: 'old-active-id',
            },
          },
        });
        expect(rpc).toHaveBeenCalledOnce();
        expect(rpc).toHaveBeenCalledWith('activate_draft_diet', {
          p_student_id: PATIENT_ID,
          p_diet_id: DIET_ID,
        });
      });

      it('rejects non-admin callers before invoking the activation RPC', async () => {
        const rpc = vi.fn();
        const response = await activateDietDraft(
          request(
            `/.netlify/functions/patient-diet-activate?studentId=${PATIENT_ID}&dietId=${DIET_ID}`,
            undefined,
            'POST',
          ),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
            createAdminClient: () => ({ rpc }),
          },
        );

        expect(response.status).toBe(403);
        expect(rpc).not.toHaveBeenCalled();
      });

      it('does not report activation success when the RPC rejects a non-draft or foreign diet', async () => {
        const rpc = vi.fn().mockResolvedValue({
          data: null,
          error: { code: '55000', message: 'database details' },
        });
        const response = await activateDietDraft(
          request(
            `/.netlify/functions/patient-diet-activate?studentId=${PATIENT_ID}&dietId=${DIET_ID}`,
            undefined,
            'POST',
          ),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({ rpc }),
          },
        );

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.error.code).toBe('DIET_NOT_DRAFT');
        expect(JSON.stringify(body)).not.toContain('database details');
        expect(rpc).toHaveBeenCalledOnce();
      });

      it('returns not found when the draft does not belong to the requested patient', async () => {
        const rpc = vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'P0002', message: 'internal ownership detail' },
        });
        const response = await activateDietDraft(
          request(
            `/.netlify/functions/patient-diet-activate?studentId=${PATIENT_ID}&dietId=${DIET_ID}`,
            undefined,
            'POST',
          ),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({ rpc }),
          },
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error.code).toBe('DIET_NOT_FOUND');
        expect(JSON.stringify(body)).not.toContain('internal ownership detail');
      });

      it('preserves generic failures as explicit safe activation errors', async () => {
        const rpc = vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'XX000', message: 'private database information' },
        });
        const response = await activateDietDraft(
          request(
            `/.netlify/functions/patient-diet-activate?studentId=${PATIENT_ID}&dietId=${DIET_ID}`,
            undefined,
            'POST',
          ),
          {
            authenticate: vi.fn().mockResolvedValue(adminContext()),
            createAdminClient: () => ({ rpc }),
          },
        );

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.error.message).toContain('confirmar a ativação');
        expect(JSON.stringify(body)).not.toContain('private database information');
      });
  });

  it('updates only via the draft-saving RPC and retains nested array ordering', async () => {
    const dependencies = setup();
    const response = await updateDietDraft(
      request(`/.netlify/functions/diet?id=${DIET_ID}`, dietPayload(), 'PUT'),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(dependencies.rpc).toHaveBeenCalledOnce();
    expect(dependencies.rpc).toHaveBeenCalledWith('save_draft_diet', {
      p_student_id: null,
      p_diet_id: DIET_ID,
      p_payload: dietPayload(),
    });
    const savedPayload = dependencies.rpc.mock.calls[0][1].p_payload;
    expect(savedPayload.meals.map(({ name }) => name)).toEqual([
      'Café da manhã',
      'Almoço',
    ]);
    expect(savedPayload.meals[0].food_groups[0].options.map(({ label }) => label)).toEqual([
      'Opção A',
      'Opção B',
    ]);
  });

  it('does not save or report success when the transactional RPC fails', async () => {
    const dependencies = setup({
      error: { code: '55000', message: 'internal database detail' },
    });
    const response = await updateDietDraft(
      request(`/.netlify/functions/diet?id=${DIET_ID}`, dietPayload(), 'PUT'),
      dependencies,
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'DIET_NOT_DRAFT',
        message: 'Somente dietas em rascunho podem ser editadas.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('internal database detail');
    expect(dependencies.rpc).toHaveBeenCalledOnce();
  });

  it('rejects unauthorized callers before creating a server client', async () => {
    const dependencies = setup();
    dependencies.authenticate.mockRejectedValue(
      new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'),
    );
    const response = await createPatientDiet(
      request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, dietPayload(), 'POST'),
      dependencies,
    );
    expect(response.status).toBe(401);
    expect(dependencies.createAdminClient).not.toHaveBeenCalled();

    dependencies.authenticate.mockResolvedValue(adminContext('STUDENT'));
    const nonAdmin = await createPatientDiet(
      request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, dietPayload(), 'POST'),
      dependencies,
    );
    expect(nonAdmin.status).toBe(403);
    expect(dependencies.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...dietPayload(), role: 'ADMIN' }],
    [{ ...dietPayload(), title: '' }],
    [{ ...dietPayload(), title: 'x'.repeat(201) }],
    [{ ...dietPayload(), target_calories: 10.5 }],
    [{ ...dietPayload(), target_protein: -1 }],
    [{ ...dietPayload(), meals: [] }],
    [{ ...dietPayload(), meals: Array.from({ length: 21 }, () => dietPayload().meals[0]) }],
    [{ ...dietPayload(), meals: [{ name: 'Meal', food_groups: [] }] }],
    [{
      ...dietPayload(),
      meals: [{
        name: 'Meal',
        scheduled_time: '25:60',
        food_groups: [{ name: 'Group', options: [{ label: 'A', food_name: 'Food', quantity: 1, unit: 'g' }] }],
      }],
    }],
    [{
      ...dietPayload(),
      meals: [{
        name: 'Meal',
        food_groups: [{
          name: 'Group',
          options: [{ label: 'A', food_name: 'Food', quantity: -1, unit: 'g' }],
        }],
      }],
    }],
    [{
      ...dietPayload(),
      meals: [{
        name: 'Meal',
        food_groups: [{
          name: 'Group',
          options: [{ label: 'A', food_name: 'Food', quantity: 1, unit: 'g', unexpected: true }],
        }],
      }],
    }],
  ])('validates nested structure, fields, and limits before writing: %j', async (body) => {
    const dependencies = setup();
    const response = await createPatientDiet(
      request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, body, 'POST'),
      dependencies,
    );
    expect(response.status).toBe(400);
    expect(dependencies.createAdminClient).not.toHaveBeenCalled();
  });

  it('validates path identifiers and HTTP methods', async () => {
    const dependencies = setup();
    const invalidPatient = await createPatientDiet(
      request('/.netlify/functions/patient-diets?id=not-a-uuid', dietPayload(), 'POST'),
      dependencies,
    );
    expect(invalidPatient.status).toBe(400);

    const invalidDiet = await updateDietDraft(
      request('/.netlify/functions/diet?id=not-a-uuid', dietPayload(), 'PUT'),
      dependencies,
    );
    expect(invalidDiet.status).toBe(400);

    const wrongMethod = await createPatientDiet(
      request(`/.netlify/functions/patient-diets?id=${PATIENT_ID}`, dietPayload(), 'PUT'),
      dependencies,
    );
    expect(wrongMethod.status).toBe(405);
    expect(dependencies.createAdminClient).not.toHaveBeenCalled();
  });
});
