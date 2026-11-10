import { describe, expect, it, vi } from 'vitest';
import changePassword from './me-password.js';

function request(password = 'a-long-test-password') {
  return new Request('https://example.test/api/me/password', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
}

function pendingProfile() {
  return {
    id: 'student-id',
    role: 'STUDENT',
    is_active: true,
    must_change_password: true,
  };
}

function mockAdminClient({
  updateResult = { data: { id: 'student-id' }, error: null },
  readResult = { data: { id: 'student-id', role: 'STUDENT', is_active: true, must_change_password: false }, error: null },
} = {}) {
  const calls = [];
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    in: vi.fn(() => updateQuery),
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => {
        calls.push('profile');
        return updateResult;
      }),
    })),
  };
  const table = {
    update: vi.fn(() => updateQuery),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          calls.push('read-profile');
          return readResult;
        }),
      })),
    })),
  };
  const client = {
    auth: {
      admin: {
        updateUserById: vi.fn(async (...args) => {
          calls.push('auth');
          return { data: { user: { id: args[0] } }, error: null };
        }),
      },
    },
    from: vi.fn(() => table),
  };

  return { client, calls };
}

describe('POST /api/me/password', () => {
  it('updates Auth before clearing the profile flag', async () => {
    const { client, calls } = mockAdminClient();
    const authenticate = vi.fn().mockResolvedValue({
      user: { id: 'student-id' },
      profile: pendingProfile(),
    });

    const response = await changePassword(request(), {
      authenticate,
      createAdminClient: () => client,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { password_change_required: false },
    });
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request));
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      'student-id',
      { password: 'a-long-test-password' },
    );
    expect(calls).toEqual(['auth', 'profile']);
  });

  it('does not clear the profile flag if Auth rejects the password', async () => {
    const { client } = mockAdminClient();
    client.auth.admin.updateUserById.mockResolvedValue({
      data: null,
      error: { message: 'private auth error' },
    });
    const authenticate = vi.fn().mockResolvedValue({
      user: { id: 'student-id' },
      profile: pendingProfile(),
    });

    const response = await changePassword(request(), {
      authenticate,
      createAdminClient: () => client,
    });

    expect(response.status).toBe(422);
    expect(client.from).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PASSWORD_UPDATE_FAILED',
        message: 'The password could not be updated. Check the requirements and try again.',
      },
    });
  });

  it('keeps the password-change gate active if profile update fails', async () => {
    const { client } = mockAdminClient({
      updateResult: {
        data: null,
        error: { message: 'private database error' },
      },
    });
    const authenticate = vi.fn().mockResolvedValue({
      user: { id: 'student-id' },
      profile: pendingProfile(),
    });

    const response = await changePassword(request(), {
      authenticate,
      createAdminClient: () => client,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PASSWORD_PROFILE_UPDATE_PENDING',
        message: 'Your password was updated, but account setup is still pending. Submit a new password to safely retry.',
      },
    });
  });

  it('requires an active account and a valid password', async () => {
    const inactive = await changePassword(request(), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'student-id' },
        profile: { ...pendingProfile(), is_active: false },
      }),
      createAdminClient: vi.fn(),
    });
    expect(inactive.status).toBe(403);

    const inactiveAdmin = await changePassword(request(), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'admin-id' },
        profile: {
          ...pendingProfile(),
          id: 'admin-id',
          role: 'SUPERADMIN',
          is_active: false,
        },
      }),
      createAdminClient: vi.fn(),
    });
    expect(inactiveAdmin.status).toBe(403);

    const invalidPassword = await changePassword(request('short'), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'student-id' },
        profile: pendingProfile(),
      }),
      createAdminClient: vi.fn(),
    });
    expect(invalidPassword.status).toBe(400);
  });

  it('supports the forced password change for the platform administrator', async () => {
    const { client } = mockAdminClient({
      updateResult: { data: { id: 'admin-id' }, error: null },
    });
    const response = await changePassword(request(), {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'admin-id' },
        profile: {
          ...pendingProfile(),
          id: 'admin-id',
          role: 'SUPERADMIN',
        },
      }),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(200);
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      'admin-id',
      { password: 'a-long-test-password' },
    );
  });

  it('recovers idempotently if the profile flag was already cleared', async () => {
    const { client } = mockAdminClient();
    const authenticate = vi.fn().mockResolvedValue({
      user: { id: 'student-id' },
      profile: { ...pendingProfile(), must_change_password: false },
    });

    const response = await changePassword(request(), {
      authenticate,
      createAdminClient: () => client,
    });

    expect(response.status).toBe(200);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith('profiles');
  });
});
