import { describe, expect, it, vi } from 'vitest';
import { createPatient, getPatients } from './patientService.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('patientService', () => {
  it('uses the authenticated API for server-side patient search', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { patients: [] } }),
    );

    await expect(
      getPatients({
        accessToken: 'admin-token',
        search: 'ana silva',
        fetchImpl,
      }),
    ).resolves.toEqual([]);

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients?search=ana+silva',
      expect.objectContaining({
        headers: { Authorization: 'Bearer admin-token' },
        cache: 'no-store',
      }),
    );
  });

  it('posts patient data with the bearer token and never stores the returned password', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        data: {
          patient: { id: 'patient-1' },
          temporary_password: 'one-time-password',
        },
      }),
    );

    await expect(
      createPatient(
        { full_name: 'Ana Silva', email: 'ana@example.test' },
        { accessToken: 'admin-token', fetchImpl },
      ),
    ).resolves.toEqual({
      patient: { id: 'patient-1' },
      temporary_password: 'one-time-password',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: 'Ana Silva',
          email: 'ana@example.test',
        }),
        cache: 'no-store',
      }),
    );
  });

  it('shows safe API errors and propagates aborts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ error: { message: 'Acesso não permitido.' } }, 403),
    );
    await expect(
      getPatients({ accessToken: 'student-token', fetchImpl }),
    ).rejects.toThrow('Acesso não permitido.');

    const abort = new DOMException('Aborted', 'AbortError');
    await expect(
      getPatients({
        accessToken: 'admin-token',
        fetchImpl: vi.fn().mockRejectedValue(abort),
      }),
    ).rejects.toBe(abort);
  });
});
