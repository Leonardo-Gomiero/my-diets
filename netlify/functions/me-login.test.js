import { describe, expect, it, vi } from 'vitest';
import updateAdminLogin from './me-login.js';

function request(login) {
  return new Request('https://example.test/api/me/login', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ login }),
  });
}

function context() {
  return {
    user: {
      id: 'superadmin-id',
      email: 'admin@accounts.my-diets.test',
    },
    profile: {
      id: 'superadmin-id',
      role: 'SUPERADMIN',
      is_active: true,
      admin_login: 'admin',
    },
  };
}

function createClient(profileUpdate = { data: { id: 'superadmin-id' }, error: null }) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue(profileUpdate),
    })),
  };
  return {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn(() => ({
      update: vi.fn(() => query),
    })),
  };
}

describe('PUT /api/me/login', () => {
  it('updates the administrator login and matching Auth identifier', async () => {
    const client = createClient();
    const response = await updateAdminLogin(request('new_admin'), {
      authenticate: vi.fn().mockResolvedValue(context()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { admin_login: 'new_admin' },
    });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
      'superadmin-id',
      {
        email: 'new_admin@accounts.my-diets.test',
        email_confirm: true,
      },
    );
  });

  it('rejects duplicate logins without changing the Auth account', async () => {
    const client = createClient({
      data: null,
      error: { code: '23505' },
    });
    const response = await updateAdminLogin(request('taken'), {
      authenticate: vi.fn().mockResolvedValue(context()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(409);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('validates the login format', async () => {
    const client = createClient();
    const response = await updateAdminLogin(request('bad login'), {
      authenticate: vi.fn().mockResolvedValue(context()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
  });
});
