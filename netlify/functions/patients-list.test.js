import { describe, expect, it, vi } from 'vitest';
import patients, { listPatients } from './patients.js';
import { HttpError } from './_shared/http.js';

function request(path = '/api/patients') {
  return new Request(`https://example.test${path}`, {
    headers: { Authorization: 'Bearer test-token' },
  });
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: { id: 'admin-id', role, is_active: true },
  };
}

function fakeListClient({
  profiles = [],
  users = [],
  profileError = null,
  usersError = null,
} = {}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn().mockResolvedValue({ data: profiles, error: profileError }),
  };
  const client = {
    from: vi.fn(() => query),
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({
          data: { users },
          error: usersError,
        }),
      },
    },
  };

  return { client, query };
}

describe('GET /api/patients', () => {
  it('requires an active administrator before creating an admin client', async () => {
    const createAdminClient = vi.fn();
    const response = await listPatients(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
      createAdminClient,
    });

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns the authenticated admin a searchable patient list without credentials', async () => {
    const { client, query } = fakeListClient({
      profiles: [
        {
          id: 'patient-1',
          full_name: 'Maria Silva',
          is_active: true,
          created_at: '2026-01-02T00:00:00Z',
          student_details: { phone: '+5511999999999' },
        },
        {
          id: 'patient-2',
          full_name: 'João Souza',
          is_active: false,
          created_at: '2026-01-03T00:00:00Z',
          student_details: null,
        },
      ],
      users: [
        { id: 'patient-1', email: 'maria@example.test' },
        { id: 'patient-2', email: 'joao@example.test' },
      ],
    });

    const response = await patients(request('/api/patients?search=maria'), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(query.eq).toHaveBeenCalledWith('role', 'STUDENT');
    expect(query.eq).toHaveBeenCalledWith('nutritionist_id', 'admin-id');
    expect(client.auth.admin.listUsers).toHaveBeenCalledWith({
      page: 1,
      perPage: 1000,
    });
    const body = await response.json();
    expect(body).toEqual({
      data: {
        patients: [
          {
            id: 'patient-1',
            full_name: 'Maria Silva',
            email: 'maria@example.test',
            phone: '+5511999999999',
            is_active: true,
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('rejects excessively long searches and sanitizes database failures', async () => {
    const createAdminClient = vi.fn(() =>
      fakeListClient({ profileError: { message: 'private db detail' } }).client,
    );

    const invalidSearch = await listPatients(
      request(`/api/patients?search=${'x'.repeat(101)}`),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient,
      },
    );
    expect(invalidSearch.status).toBe(400);

    const unavailable = await listPatients(request(), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient,
    });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain('private db detail');
  });

  it('does not access profiles for unsupported methods', async () => {
    const createAdminClient = vi.fn();
    const response = await listPatients(
      new Request('https://example.test/api/patients', { method: 'POST' }),
      {
        authenticate: vi.fn().mockRejectedValue(
          new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'),
        ),
        createAdminClient,
      },
    );

    expect(response.status).toBe(405);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
