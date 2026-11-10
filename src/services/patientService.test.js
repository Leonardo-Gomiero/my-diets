import { describe, expect, it, vi } from 'vitest';
import {
  createPatient,
  getPatient,
  getPatients,
  resetPatientPassword,
  updatePatient,
  updatePatientStatus,
} from './patientService.js';

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

  it('uses the per-patient detail and update endpoints with a bearer token', async () => {
    const patient = {
      id: 'patient-1',
      full_name: 'Ana Silva',
      email: 'ana@example.test',
      phone: null,
      is_active: true,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ data: { patient } }))
      .mockResolvedValueOnce(response({ data: { patient } }));

    await expect(
      getPatient(patient.id, { accessToken: 'admin-token', fetchImpl }),
    ).resolves.toEqual(patient);
    await expect(
      updatePatient(
        patient.id,
        { full_name: patient.full_name, email: patient.email, phone: null },
        { accessToken: 'admin-token', fetchImpl },
      ),
    ).resolves.toEqual(patient);

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/patients/patient-1');
    expect(fetchImpl.mock.calls[1]).toEqual([
      '/api/patients/patient-1',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer admin-token',
          'Content-Type': 'application/json',
        },
      }),
    ]);
  });

  it('uses a dedicated status endpoint for activation and deactivation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ data: { patient: { id: 'patient-1', is_active: false } } }),
    );

    await expect(
      updatePatientStatus('patient-1', false, {
        accessToken: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toEqual({ id: 'patient-1', is_active: false });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients/patient-1/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
    );
  });

  it('uses the authenticated temporary-password reset endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        data: {
          patient: { id: 'patient-1', is_active: true },
          temporary_password: 'one-time-password',
        },
      }),
    );

    await expect(
      resetPatientPassword('patient-1', {
        accessToken: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      patient: { id: 'patient-1', is_active: true },
      temporary_password: 'one-time-password',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/patients/patient-1/temporary-password',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer admin-token' },
        cache: 'no-store',
      }),
    );
  });
});
