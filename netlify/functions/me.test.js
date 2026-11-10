import { describe, expect, it, vi } from 'vitest';
import me from './me.js';
import { HttpError } from './_shared/http.js';

function request(method = 'GET') {
  return new Request('https://example.test/api/me', {
    method,
    headers: { Authorization: 'Bearer test-token' },
  });
}

describe('GET /api/me', () => {
  it('returns only the authenticated user and application profile', async () => {
    const context = {
      user: { id: 'auth-user-id', email: 'person@example.test' },
      profile: {
        id: 'auth-user-id',
        role: 'ADMIN',
        is_active: true,
        must_change_password: false,
      },
    };

    const response = await me(request(), {
      authenticate: vi.fn().mockResolvedValue(context),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: context });
  });

  it('returns the platform administrator identity without nutritionist data', async () => {
    const response = await me(request(), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'admin-user-id', email: 'admin@accounts.my-diets.test' },
        profile: {
          id: 'admin-user-id',
          full_name: 'Administrador',
          role: 'SUPERADMIN',
          admin_login: 'admin',
          is_active: true,
          must_change_password: false,
        },
      }),
      createAdminClient: vi.fn(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        user: {
          id: 'admin-user-id',
          email: 'admin@accounts.my-diets.test',
        },
        profile: {
          id: 'admin-user-id',
          full_name: 'Administrador',
          role: 'SUPERADMIN',
          admin_login: 'admin',
          is_active: true,
          must_change_password: false,
        },
      },
    });
  });

  it('returns the responsible nutritionist contact to a patient', async () => {
    const profile = {
      id: 'patient-id',
      full_name: 'Paciente',
      role: 'STUDENT',
      is_active: true,
      must_change_password: false,
      nutritionist_id: 'nutritionist-id',
      nutritionist_details: null,
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'nutritionist-id',
          full_name: 'Dra. Nutri',
          nutritionist_details: [{ phone: '+55 11 99999-9999' }],
        },
        error: null,
      }),
    };

    const response = await me(request(), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'patient-id', email: 'patient@example.test' },
        profile,
      }),
      createAdminClient: () => ({ from: vi.fn(() => query) }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        user: { id: 'patient-id', email: 'patient@example.test' },
        profile: {
          id: 'patient-id',
          full_name: 'Paciente',
          role: 'STUDENT',
          is_active: true,
          must_change_password: false,
          nutritionist_id: 'nutritionist-id',
        },
        nutritionist: {
          id: 'nutritionist-id',
          full_name: 'Dra. Nutri',
          whatsapp: '+55 11 99999-9999',
        },
      },
    });
  });

  it('rejects inactive accounts and invalid roles', async () => {
    for (const profile of [
      { id: 'auth-user-id', role: 'ADMIN', is_active: false },
      { id: 'auth-user-id', role: 'UNKNOWN', is_active: true },
    ]) {
      const response = await me(request(), {
        authenticate: vi.fn().mockResolvedValue({
          user: { id: 'auth-user-id' },
          profile,
        }),
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty('error');
    }
  });

  it('does not return a protected profile during a required password change', async () => {
    const response = await me(request(), {
      authenticate: vi.fn().mockRejectedValue(
        new HttpError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Change your password before accessing this resource.',
        ),
      ),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(body).not.toHaveProperty('data');
  });

  it('rejects unsupported methods', async () => {
    const response = await me(request('POST'));
    expect(response.status).toBe(405);
  });
});
