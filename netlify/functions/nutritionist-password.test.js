import { describe, expect, it, vi } from 'vitest';
import resetNutritionistPassword from './nutritionist-password.js';

const NUTRITIONIST_ID = '343e4567-e89b-42d3-a456-426614174000';

function request(method = 'POST', id = NUTRITIONIST_ID) {
  return new Request(
    `https://example.test/api/nutritionists/temporary-password?id=${id}`,
    {
      method,
      headers: { Authorization: 'Bearer test-token' },
    },
  );
}

function superAdminContext(role = 'SUPERADMIN') {
  return {
    user: { id: 'superadmin-id' },
    profile: { id: 'superadmin-id', role, is_active: true },
  };
}

function fakeClient({
  inactive = false,
  lockError = null,
  authError = null,
  confirmationFails = false,
} = {}) {
  const events = [];
  let queryCount = 0;
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn((values) => {
      events.push(`profile-update:${JSON.stringify(values)}`);
      return builder;
    }),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return {
          data: {
            id: NUTRITIONIST_ID,
            full_name: 'Dra. Nutri',
            role: 'ADMIN',
            is_active: !inactive,
          },
          error: null,
        };
      }
      if (queryCount === 2) {
        return {
          data: lockError ? null : { id: NUTRITIONIST_ID, must_change_password: true },
          error: lockError,
        };
      }
      return {
        data: {
          id: NUTRITIONIST_ID,
          role: 'ADMIN',
          is_active: true,
          must_change_password: !confirmationFails,
        },
        error: null,
      };
    }),
  };
  const updateUserById = vi.fn(async () => {
    events.push('auth-password-update');
    return {
      data: { user: { id: NUTRITIONIST_ID, email: 'nutri@example.test' } },
      error: authError,
    };
  });
  const client = {
    from: vi.fn(() => builder),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { id: NUTRITIONIST_ID, email: 'nutri@example.test' } },
          error: null,
        }),
        updateUserById,
      },
    },
  };
  return { client, events, updateUserById };
}

describe('POST /api/nutritionists/:id/temporary-password', () => {
  it('generates a one-time password and requires it to be changed', async () => {
    const { client, events, updateUserById } = fakeClient();
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext()),
      createAdminClient: () => client,
      createPassword: () => 'new-temporary-password',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(events.indexOf('profile-update:{"must_change_password":true}'))
      .toBeLessThan(events.indexOf('auth-password-update'));
    expect(updateUserById).toHaveBeenCalledWith(
      NUTRITIONIST_ID,
      { password: 'new-temporary-password' },
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        nutritionist: {
          id: NUTRITIONIST_ID,
          full_name: 'Dra. Nutri',
          email: 'nutri@example.test',
        },
        temporary_password: 'new-temporary-password',
      },
    });
  });

  it('allows only the platform administrator to reset nutritionist passwords', async () => {
    const { client } = fakeClient();
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext('ADMIN')),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(403);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('does not change credentials when the nutritionist is inactive', async () => {
    const { client } = fakeClient({ inactive: true });
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(403);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('does not replace the password unless access is first locked', async () => {
    const { client } = fakeClient({ lockError: { code: 'DATABASE_ERROR' } });
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(503);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('rejects malformed nutritionist IDs before accessing the database', async () => {
    const { client } = fakeClient();
    const response = await resetNutritionistPassword(
      request('POST', 'not-an-id'),
      {
        authenticate: vi.fn().mockResolvedValue(superAdminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('keeps the account locked if updating the auth password fails', async () => {
    const { client, events } = fakeClient({ authError: { code: 'AUTH_ERROR' } });
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext()),
      createAdminClient: () => client,
      createPassword: () => 'new-temporary-password',
    });

    expect(response.status).toBe(503);
    expect(events).toContain('profile-update:{"must_change_password":true}');
    expect(events).toContain('auth-password-update');
  });

  it('does not return credentials unless the required password change is confirmed', async () => {
    const { client } = fakeClient({ confirmationFails: true });
    const response = await resetNutritionistPassword(request(), {
      authenticate: vi.fn().mockResolvedValue(superAdminContext()),
      createAdminClient: () => client,
      createPassword: () => 'new-temporary-password',
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.not.toHaveProperty(
      'data.temporary_password',
    );
  });
});
