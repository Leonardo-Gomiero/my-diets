import { describe, expect, it, vi } from 'vitest';
import { getActiveDiet } from './activeDietService.js';

function response(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('getActiveDiet', () => {
  it('requests the active diet without sending a student identifier', async () => {
    const diet = {
      id: 'diet-1',
      title: 'Plano semanal',
      status: 'ACTIVE',
      meals: [],
    };
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: { diet } }));

    await expect(
      getActiveDiet({ accessToken: 'student-jwt', fetchImpl }),
    ).resolves.toEqual(diet);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/me/active-diet',
      expect.objectContaining({
        headers: { Authorization: 'Bearer student-jwt' },
        cache: 'no-store',
      }),
    );
    expect(fetchImpl.mock.calls[0][0]).not.toContain('student');
  });

  it('accepts a successful empty state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { diet: null } }),
    );
    await expect(
      getActiveDiet({ accessToken: 'student-jwt', fetchImpl }),
    ).resolves.toBeNull();
  });

  it.each([
    ['ACCOUNT_INACTIVE', 'Esta conta está inativa.'],
    ['PASSWORD_CHANGE_REQUIRED', 'Troque sua senha antes de consultar a dieta.'],
  ])('maps protected-access failure %s to a safe message', async (code, message) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ error: { code, message: 'sensitive internal text' } }, {
        ok: false,
        status: 403,
      }),
    );
    await expect(
      getActiveDiet({ accessToken: 'student-jwt', fetchImpl }),
    ).rejects.toThrow(message);
  });

  it('rejects malformed or non-active diet responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        data: {
          diet: { id: 'diet-1', title: 'Archived plan', status: 'ARCHIVED', meals: [] },
        },
      }),
    );
    await expect(
      getActiveDiet({ accessToken: 'student-jwt', fetchImpl }),
    ).rejects.toThrow('O serviço retornou uma resposta inválida.');
  });
});
