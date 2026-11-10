import { describe, expect, it, vi } from 'vitest';
import nutritionists from '../../functions/nutritionists.js';

function request(method, body) {
  return new Request('https://example.test/api/nutritionists', {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function adminContext(role = 'SUPERADMIN') {
  return {
    user: { id: 'superadmin-id' },
    profile: { id: 'superadmin-id', role, is_active: true },
  };
}

function creationClient() {
  const profileInsert = vi.fn().mockResolvedValue({ error: null });
  const detailsInsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'nutritionist-id' } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn((table) =>
      table === 'profiles'
        ? { insert: profileInsert }
        : { insert: detailsInsert },
    ),
  };
  return { client, profileInsert, detailsInsert };
}

function statusClient() {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '0c7f8680-c527-4fc7-a145-a56d55933f0d' },
        error: null,
      }),
    })),
  };
  const update = vi.fn(() => query);
  return {
    client: { from: vi.fn(() => ({ update })) },
    update,
  };
}

describe('/api/nutritionists', () => {
  it('creates a nutritionist account with a forced password change', async () => {
    const { client, profileInsert, detailsInsert } = creationClient();
    const response = await nutritionists(
      request('POST', {
        full_name: 'Dra. Nutri',
        email: 'nutri@example.test',
        phone: '+55 11 99999-9999',
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
        createPassword: () => 'temporary-pass',
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        nutritionist: {
          id: 'nutritionist-id',
          full_name: 'Dra. Nutri',
          email: 'nutri@example.test',
          phone: '+55 11 99999-9999',
          is_active: true,
        },
        temporary_password: 'temporary-pass',
      },
    });
    expect(client.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'nutri@example.test',
        password: 'temporary-pass',
        email_confirm: true,
      }),
    );
    expect(profileInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'nutritionist-id',
        role: 'ADMIN',
        must_change_password: true,
        is_active: true,
      }),
    );
    expect(detailsInsert).toHaveBeenCalledWith({
      user_id: 'nutritionist-id',
      phone: '+55 11 99999-9999',
    });
  });

  it('does not let a nutritionist manage other nutritionists', async () => {
    const { client } = creationClient();
    const response = await nutritionists(
      request('POST', {
        full_name: 'Dra. Nutri',
        email: 'nutri@example.test',
        phone: null,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext('ADMIN')),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(403);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('validates input before creating an Auth account', async () => {
    const { client } = creationClient();
    const response = await nutritionists(
      request('POST', {
        full_name: 'Dra. Nutri',
        email: 'not-an-email',
        phone: null,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(400);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('soft-deletes a nutritionist by deactivating the profile', async () => {
    const { client, update } = statusClient();
    const response = await nutritionists(
      new Request(
        'https://example.test/api/nutritionists?id=0c7f8680-c527-4fc7-a145-a56d55933f0d',
        {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: false }),
        },
      ),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        nutritionist: {
          id: '0c7f8680-c527-4fc7-a145-a56d55933f0d',
          is_active: false,
        },
      },
    });
    expect(update).toHaveBeenCalledWith({ is_active: false });
  });
});
