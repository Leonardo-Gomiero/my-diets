import { describe, expect, it, vi } from 'vitest';
import {
  activateDiet,
  createDiet,
  getDiet,
  getDietHistory,
  updateDiet,
} from './dietService.js';

const diet = {
  id: 'diet-1',
  student_id: 'patient-1',
  version: 2,
  status: 'DRAFT',
};
const payload = {
  title: 'Plano',
  meals: [],
};

function response(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('dietService', () => {
  it('creates a diet through the patient endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { diet } }));
    await expect(
      createDiet('patient id', payload, {
        accessToken: 'token',
        fetchImpl,
      }),
    ).resolves.toEqual(diet);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients/patient%20id/diets',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }),
    );
  });

  it('updates a diet through the diet endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { diet } }));
    await expect(
      updateDiet('diet/1', payload, {
        accessToken: 'token',
        fetchImpl,
      }),
    ).resolves.toEqual(diet);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/diets/diet%2F1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('maps server errors without hiding failed updates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            code: 'DIET_NOT_DRAFT',
            message: 'database details must not be surfaced',
          },
        },
        { ok: false, status: 409 },
      ),
    );
    await expect(
      updateDiet('diet-1', payload, { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('Não foi possível editar esta dieta.');
  });

  it('rejects malformed success payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: { id: 'diet-1' } } }),
    );
    await expect(
      createDiet('patient-1', payload, { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('O serviço retornou uma resposta inválida.');
  });

  it('loads any existing diet for editing', async () => {
    const activeDiet = {
      ...diet,
      status: 'ACTIVE',
      meals: [],
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: activeDiet } }),
    );

    await expect(
      getDiet('diet-1', { accessToken: 'token', fetchImpl }),
    ).resolves.toEqual(activeDiet);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/diets/diet-1',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('loads patient diet history from the authenticated endpoint', async () => {
    const diets = [diet];
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diets } }),
    );
    await expect(
      getDietHistory('patient/1', { accessToken: 'token', fetchImpl }),
    ).resolves.toEqual(diets);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients/patient%2F1/diets',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
        cache: 'no-store',
      }),
    );
  });

  it('activates a draft scoped to the expected patient', async () => {
    const activeDiet = { ...diet, status: 'ACTIVE', previous_active_id: 'old-diet' };
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: activeDiet } }),
    );
    await expect(
      activateDiet('patient-1', 'diet-1', { accessToken: 'token', fetchImpl }),
    ).resolves.toEqual(activeDiet);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients/patient-1/diets/diet-1/activate',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      }),
    );
  });

  it('explains that archived diets can be reactivated', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(
        { error: { code: 'DIET_NOT_ACTIVATABLE' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(
      activateDiet('patient-1', 'diet-1', { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('Somente rascunhos ou dietas arquivadas podem ser ativados.');
  });

  it('rejects activation results for a different patient or non-active status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: { ...diet, student_id: 'other-patient', status: 'ACTIVE' } } }),
    );
    await expect(
      activateDiet('patient-1', 'diet-1', { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('O serviço retornou uma resposta inválida.');
  });
});
