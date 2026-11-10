import { describe, expect, it, vi } from 'vitest';
import patientPassword from './patient-password.js';
import { HttpError } from './_shared/http.js';
import { authenticateRequest } from './_shared/auth.js';

const PATIENT_ID = '343e4567-e89b-42d3-a456-426614174000';

function request(method = 'POST') {
  return new Request(
    `https://example.test/api/patients/${PATIENT_ID}/temporary-password?id=${PATIENT_ID}`,
    {
      method,
      headers: { Authorization: 'Bearer test-token' },
    },
  );
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: { id: 'admin-id', role, is_active: true },
  };
}

function fakeClient({
  isActive = true,
  lockError = null,
  authError = null,
  confirmationError = null,
} = {}) {
  const events = [];
  let profileRead = 0;
  const profileBuilder = {
    select: vi.fn((columns) => {
      events.push(`select:${columns}`);
      return profileBuilder;
    }),
    update: vi.fn((values) => {
      events.push(`profile-update:${JSON.stringify(values)}`);
      return profileBuilder;
    }),
    eq: vi.fn((column, value) => {
      events.push(`eq:${column}:${value}`);
      return profileBuilder;
    }),
    maybeSingle: vi.fn(() => {
      profileRead += 1;
      if (profileRead === 1) {
        return Promise.resolve({
          data: {
            id: PATIENT_ID,
            full_name: 'Ana Exemplo',
            role: 'STUDENT',
            is_active: isActive,
            must_change_password: false,
            student_details: null,
          },
          error: null,
        });
      }

      if (profileRead === 2) {
        return Promise.resolve({
          data: lockError
            ? null
            : { id: PATIENT_ID, must_change_password: true },
          error: lockError,
        });
      }

      return Promise.resolve({
        data: confirmationError
          ? null
          : {
              id: PATIENT_ID,
              role: 'STUDENT',
              is_active: true,
              must_change_password: true,
            },
        error: confirmationError,
      });
    }),
  };

  const authUpdate = vi.fn(async (id, values) => {
    events.push(`auth-update:${id}`);
    return {
      data: { user: { id, email: 'ana@example.test' } },
      error: authError,
    };
  });
  const client = {
    from: vi.fn((table) => {
      events.push(`from:${table}`);
      if (table !== 'profiles') {
        throw new Error('Unexpected table access');
      }
      return profileBuilder;
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async () => {
          events.push('auth-read');
          return {
            data: { user: { id: PATIENT_ID, email: 'ana@example.test' } },
            error: null,
          };
        }),
        updateUserById: authUpdate,
      },
    },
  };

  return { client, authUpdate, events, profileBuilder };
}

describe('POST /api/patients/:id/temporary-password', () => {
  it('requires an authenticated admin before using privileged Supabase access', async () => {
    const createAdminClient = vi.fn();
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
      createAdminClient,
    });

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('replaces Auth password, locks normal access first, and returns it once', async () => {
    const { client, authUpdate, events } = fakeClient();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const password = 'new-one-time-temporary-password';
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: vi.fn(() => password),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(events.indexOf('profile-update:{"must_change_password":true}'))
      .toBeLessThan(events.indexOf(`auth-update:${PATIENT_ID}`));
    expect(authUpdate).toHaveBeenCalledWith(PATIENT_ID, { password });
    const body = await response.json();
    expect(body).toEqual({
      data: {
        patient: {
          id: PATIENT_ID,
          full_name: 'Ana Exemplo',
          email: 'ana@example.test',
          is_active: true,
        },
        temporary_password: password,
      },
    });
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(client.from.mock.calls)).not.toContain(password);

    await expect(
      authenticateRequest(request(), {
        createVerifierClient: () => ({
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: { user: { id: PATIENT_ID } },
              error: null,
            }),
          },
        }),
        createProfileClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: PATIENT_ID,
                    role: 'STUDENT',
                    is_active: true,
                    must_change_password: true,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  it('does not replace the password if profile access cannot first be locked', async () => {
    const { client, authUpdate } = fakeClient({
      lockError: { message: 'private database error' },
    });
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => 'new-one-time-temporary-password',
    });

    expect(response.status).toBe(503);
    expect(authUpdate).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).toContain('PATIENT_PASSWORD_LOCK_FAILED');
    expect(body).not.toContain('private database error');
    expect(body).not.toContain('new-one-time-temporary-password');
  });

  it('keeps forced password change required if Auth replacement fails', async () => {
    const { client, authUpdate } = fakeClient({
      authError: { message: 'private auth error' },
    });
    const password = 'new-one-time-temporary-password';
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => password,
    });

    expect(response.status).toBe(503);
    expect(authUpdate).toHaveBeenCalledWith(PATIENT_ID, { password });
    const body = await response.text();
    expect(body).toContain('PATIENT_PASSWORD_RESET_PENDING');
    expect(body).not.toContain(password);
    expect(body).not.toContain('private auth error');
  });

  it('does not return a password when the final forced-change state cannot be confirmed', async () => {
    const { client } = fakeClient({
      confirmationError: { message: 'private database error' },
    });
    const password = 'new-one-time-temporary-password';
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => password,
    });

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('PATIENT_PASSWORD_RESET_PENDING');
    expect(body).not.toContain(password);
  });

  it('rejects inactive patients without changing their Auth password', async () => {
    const { client, authUpdate } = fakeClient({ isActive: false });
    const response = await patientPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(403);
    expect(authUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid caller and unsupported methods', async () => {
    const createAdminClient = vi.fn();
    const forbidden = await patientPassword(request(), {
      authenticate: vi.fn().mockRejectedValue(
        new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'),
      ),
      createAdminClient,
    });
    expect(forbidden.status).toBe(401);

    const unsupported = await patientPassword(request('GET'), {
      authenticate: vi.fn(),
      createAdminClient,
    });
    expect(unsupported.status).toBe(405);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
