import { describe, expect, it, vi } from 'vitest';
import patientDetail from './patient-detail.js';
import patientStatus from './patient-status.js';
import me from './me.js';

const PATIENT_ID = '343e4567-e89b-42d3-a456-426614174000';

function request(path, method = 'GET', body) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: { id: 'admin-id', role, is_active: true },
  };
}

function fakeAdminClient({
  profile = {
    id: PATIENT_ID,
    full_name: 'Ana Exemplo',
    role: 'STUDENT',
    is_active: true,
    must_change_password: false,
    created_at: '2026-01-02T00:00:00Z',
    student_details: { phone: '+5511999999999' },
  },
  authUser = { id: PATIENT_ID, email: 'ana@example.test' },
  selectError = null,
  profileUpdateError = null,
  detailsUpdateError = null,
  authUpdateError = null,
  statusUpdateError = null,
} = {}) {
  const profileSelect = {
    select: vi.fn(() => profileSelect),
    eq: vi.fn(() => profileSelect),
    maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: selectError }),
  };
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then(resolve, reject) {
      return Promise.resolve({ error: profileUpdateError ?? statusUpdateError })
        .then(resolve, reject);
    },
  };
  const detailsUpdateQuery = {
    eq: vi.fn(() => detailsUpdateQuery),
    then(resolve, reject) {
      return Promise.resolve({ error: detailsUpdateError }).then(resolve, reject);
    },
  };
  const detailsInsert = vi.fn().mockResolvedValue({ error: detailsUpdateError });
  const profileUpdate = vi.fn(() => updateQuery);
  const authUpdateUser = vi.fn().mockResolvedValue({ error: authUpdateError });
  const client = {
    from: vi.fn((table) => {
      if (table === 'profiles') {
        return {
          select: profileSelect.select,
          eq: profileSelect.eq,
          maybeSingle: profileSelect.maybeSingle,
          update: profileUpdate,
        };
      }
      if (table === 'student_details') {
        return {
          update: vi.fn(() => detailsUpdateQuery),
          insert: detailsInsert,
          delete: vi.fn(() => detailsUpdateQuery),
        };
      }
      throw new Error(`Unexpected table access: ${table}`);
    }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: authUser },
          error: null,
        }),
        updateUserById: authUpdateUser,
      },
    },
  };
  return { client, profileSelect, updateQuery, detailsUpdateQuery, profileUpdate };
}

describe('GET and PUT /api/patients/:id', () => {
  it('returns only basic patient details to an authenticated admin', async () => {
    const { client } = fakeAdminClient();
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    await expect(response.json()).resolves.toEqual({
      data: {
        patient: {
          id: PATIENT_ID,
          full_name: 'Ana Exemplo',
          email: 'ana@example.test',
          phone: '+5511999999999',
          is_active: true,
          created_at: '2026-01-02T00:00:00Z',
        },
      },
    });
  });

  it('rejects non-admin access without creating a privileged client', async () => {
    const createAdminClient = vi.fn();
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
        createAdminClient,
      },
    );

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects non-admin edits before performing profile or Auth updates', async () => {
    const createAdminClient = vi.fn();
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`, 'PUT', {
        full_name: 'Ana Atualizada',
        email: 'ana@example.test',
        phone: null,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
        createAdminClient,
      },
    );

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ full_name: '', email: 'ana@example.test', phone: null }],
    [{ full_name: 'Ana', email: 'invalid', phone: null }],
    [{ full_name: 'Ana', email: 'ana@example.test', phone: 'x'.repeat(33) }],
    [{
      full_name: 'Ana',
      email: 'ana@example.test',
      phone: null,
      role: 'ADMIN',
    }],
  ])('validates update data before changing the profile: %j', async (body) => {
    const { client } = fakeAdminClient();
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`, 'PUT', body),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(400);
    expect(client.from).not.toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('updates profile, optional phone and normalized Auth email', async () => {
    const { client } = fakeAdminClient();
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`, 'PUT', {
        full_name: ' Ana Atualizada ',
        email: 'ANA.NEW@example.test',
        phone: '+5511888888888',
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(PATIENT_ID, {
      email: 'ana.new@example.test',
      email_confirm: true,
    });
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(client.from).toHaveBeenCalledWith('student_details');
    const body = await response.json();
    expect(body.data.patient).toMatchObject({
      id: PATIENT_ID,
      full_name: 'Ana Atualizada',
      email: 'ana.new@example.test',
      phone: '+5511888888888',
      is_active: true,
    });
  });

  it('rolls back changes when updating the Auth email fails', async () => {
    const { client } = fakeAdminClient({
      authUpdateError: null,
    });
    client.auth.admin.updateUserById
      .mockResolvedValueOnce({
        error: { code: 'email_exists', status: 409 },
      })
      .mockResolvedValueOnce({ error: null });
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`, 'PUT', {
        full_name: 'Ana Atualizada',
        email: 'outra@example.test',
        phone: '+5511888888888',
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
    expect(client.auth.admin.updateUserById).toHaveBeenLastCalledWith(PATIENT_ID, {
      email: 'ana@example.test',
      email_confirm: true,
    });
  });

  it('does not expose missing admin or non-student profiles', async () => {
    const { client } = fakeAdminClient({ profile: null });
    const response = await patientDetail(
      request(`/api/patients/${PATIENT_ID}?id=${PATIENT_ID}`),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/patients/:id/status', () => {
  it('deactivates without deleting the profile or touching diet history', async () => {
    const { client, profileUpdate } = fakeAdminClient();
    const response = await patientStatus(
      request(`/api/patients/${PATIENT_ID}/status?id=${PATIENT_ID}`, 'PATCH', {
        is_active: false,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { patient: { id: PATIENT_ID, is_active: false } },
    });
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(profileUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(client.from).not.toHaveBeenCalledWith('diets');
    expect(client.from).not.toHaveBeenCalledWith('meals');

    const inactiveProfileResponse = await me(
      new Request('https://example.test/api/me', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      {
        authenticate: vi.fn().mockResolvedValue({
          user: { id: PATIENT_ID },
          profile: {
            id: PATIENT_ID,
            role: 'STUDENT',
            is_active: false,
            must_change_password: false,
          },
        }),
      },
    );
    expect(inactiveProfileResponse.status).toBe(403);
    expect((await inactiveProfileResponse.json()).error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('reactivates an inactive profile without replacing its identity or history', async () => {
    const { client } = fakeAdminClient({
      profile: {
        id: PATIENT_ID,
        full_name: 'Ana Exemplo',
        role: 'STUDENT',
        is_active: false,
        student_details: null,
      },
    });
    const response = await patientStatus(
      request(`/api/patients/${PATIENT_ID}/status?id=${PATIENT_ID}`, 'PATCH', {
        is_active: true,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient: () => client,
      },
    );

    expect(response.status).toBe(200);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith('diets');
    expect(client.from).not.toHaveBeenCalledWith('profiles-delete');
  });

  it('rejects invalid status, invalid IDs and non-admin callers', async () => {
    const createAdminClient = vi.fn(() => fakeAdminClient().client);
    const invalidStatus = await patientStatus(
      request(`/api/patients/${PATIENT_ID}/status?id=${PATIENT_ID}`, 'PATCH', {
        is_active: 'false',
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient,
      },
    );
    expect(invalidStatus.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();

    const invalidId = await patientStatus(
      request('/api/patients/not-a-uuid/status?id=not-a-uuid', 'PATCH', {
        is_active: false,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext()),
        createAdminClient,
      },
    );
    expect(invalidId.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();

    const forbidden = await patientStatus(
      request(`/api/patients/${PATIENT_ID}/status?id=${PATIENT_ID}`, 'PATCH', {
        is_active: false,
      }),
      {
        authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
        createAdminClient,
      },
    );
    expect(forbidden.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
