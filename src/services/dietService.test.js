import { describe, expect, it, vi } from 'vitest';
import { createDietDraft, updateDietDraft } from './dietService.js';

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
  it('creates a draft through the patient endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { diet } }));
    await expect(
      createDietDraft('patient id', payload, {
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

  it('updates a draft through the diet endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { diet } }));
    await expect(
      updateDietDraft('diet/1', payload, {
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
      updateDietDraft('diet-1', payload, { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('Somente rascunhos podem ser editados.');
  });

  it('rejects malformed success payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: { id: 'diet-1' } } }),
    );
    await expect(
      createDietDraft('patient-1', payload, { accessToken: 'token', fetchImpl }),
    ).rejects.toThrow('O serviço retornou uma resposta inválida.');
  });
});
