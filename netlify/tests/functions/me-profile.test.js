import { describe, expect, it, vi } from 'vitest';
import updateNutritionistProfile from '../../functions/me-profile.js';

function request(body, method = 'PUT') {
  return new Request('https://example.test/api/me/profile', {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: {
      id: 'admin-id',
      full_name: 'Nome anterior',
      role,
      is_active: true,
    },
  };
}

function makeClient() {
  const profileUpdate = {
    eq: vi.fn(() => profileUpdate),
    then(resolve, reject) {
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  const detailsUpsert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: vi.fn((table) =>
      table === 'profiles'
        ? { update: vi.fn(() => profileUpdate) }
        : { upsert: detailsUpsert },
    ),
  };
  return { client, profileUpdate, detailsUpsert };
}

describe('PUT /api/me/profile', () => {
  it('updates the nutritionist name and WhatsApp', async () => {
    const { client, detailsUpsert } = makeClient();
    const response = await updateNutritionistProfile(
      request({ full_name: 'Dra. Maria', whatsapp: '+55 (11) 99999-9999' }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        profile: {
          id: 'admin-id',
          full_name: 'Dra. Maria',
          whatsapp: '+55 (11) 99999-9999',
        },
      },
    });
    expect(detailsUpsert).toHaveBeenCalledWith(
      { user_id: 'admin-id', phone: '+55 (11) 99999-9999' },
      { onConflict: 'user_id' },
    );
  });

  it('rejects invalid numbers and non-nutritionists before database writes', async () => {
    const createAdminClient = vi.fn();
    const invalidPhone = await updateNutritionistProfile(
      request({ full_name: 'Dra. Maria', whatsapp: '123' }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient,
      },
    );
    expect(invalidPhone.status).toBe(400);

    const forbidden = await updateNutritionistProfile(
      request({ full_name: 'Paciente', whatsapp: null }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
        createAdminClient,
      },
    );
    expect(forbidden.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
