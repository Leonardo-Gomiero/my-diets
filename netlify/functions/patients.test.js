import { afterEach, describe, expect, it, vi } from 'vitest';
import createPatient from './patients.js';
import { generateTemporaryPassword } from './_shared/temporaryPassword.js';
import { HttpError } from './_shared/http.js';

function request(body, method = 'POST') {
  return new Request('https://example.test/api/patients', {
    method,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function adminContext(role = 'ADMIN') {
  return {
    user: { id: 'admin-id' },
    profile: { id: 'admin-id', role, is_active: true },
  };
}

function fakeAdminClient({
  profileInsertError = null,
  detailsInsertError = null,
  cleanupError = null,
} = {}) {
  const profileInsert = vi.fn().mockResolvedValue({ error: profileInsertError });
  const profileDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: cleanupError }),
  });
  const detailsInsert = vi.fn().mockResolvedValue({ error: detailsInsertError });

  const client = {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'created-patient-id' } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn((table) => {
      if (table === 'profiles') {
        return { insert: profileInsert, delete: profileDelete };
      }
      if (table === 'student_details') {
        return { insert: detailsInsert };
      }
      throw new Error('Unexpected table access');
    }),
  };

  return { client, profileInsert, profileDelete, detailsInsert };
}

const validPatient = {
  full_name: 'Sample Patient',
  email: 'PATIENT@example.test',
  phone: '+55 11 1234-5678',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/patients', () => {
  it('creates a confirmed Auth user and patient profile, returning the password once', async () => {
    const { client, profileInsert, detailsInsert } = fakeAdminClient();
    const createPassword = vi.fn(() => 'one-time-test-password');
    const response = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword,
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    await expect(response.json()).resolves.toEqual({
      data: {
        patient: {
          id: 'created-patient-id',
          full_name: 'Sample Patient',
          email: 'patient@example.test',
          phone: '+55 11 1234-5678',
          role: 'STUDENT',
          must_change_password: true,
          is_active: true,
        },
        temporary_password: 'one-time-test-password',
      },
    });
    expect(client.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'patient@example.test',
      password: 'one-time-test-password',
      email_confirm: true,
      user_metadata: { full_name: 'Sample Patient' },
    });
    expect(profileInsert).toHaveBeenCalledWith({
      id: 'created-patient-id',
      full_name: 'Sample Patient',
      role: 'STUDENT',
      must_change_password: true,
      is_active: true,
    });
    expect(detailsInsert).toHaveBeenCalledWith({
      user_id: 'created-patient-id',
      phone: '+55 11 1234-5678',
    });
    expect(JSON.stringify(profileInsert.mock.calls)).not.toContain(
      'one-time-test-password',
    );
    expect(createPassword).toHaveBeenCalledOnce();
  });

  it('does not create accounts for unauthenticated or non-admin callers', async () => {
    const { client } = fakeAdminClient();
    const createAdminClient = vi.fn(() => client);

    const unauthenticated = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockRejectedValue(
        new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer token is required.'),
      ),
      createAdminClient,
    });
    expect(unauthenticated.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();

    const nonAdmin = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockResolvedValue(adminContext('STUDENT')),
      createAdminClient,
    });
    expect(nonAdmin.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ full_name: '', email: 'patient@example.test' }],
    [{ full_name: 'Patient', email: 'not-an-email' }],
    [{ full_name: 'Patient', email: 'patient@example.test', phone: 123 }],
    [{ full_name: 'Patient', email: 'patient@example.test', phone: 'x'.repeat(33) }],
  ])('validates input before creating a user: %j', async (body) => {
    const { client } = fakeAdminClient();
    const response = await createPatient(request(body), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
    });

    expect(response.status).toBe(400);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('removes the Auth identity when profile creation fails and never returns the password', async () => {
    const { client } = fakeAdminClient({
      profileInsertError: { message: 'private database error' },
    });

    const response = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => 'one-time-test-password',
    });

    expect(response.status).toBe(503);
    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(
      'created-patient-id',
    );
    const body = await response.text();
    expect(body).not.toContain('one-time-test-password');
    expect(body).not.toContain('private database error');
  });

  it('returns an explicit safe error if orphan cleanup cannot be confirmed', async () => {
    const { client } = fakeAdminClient({
      profileInsertError: { message: 'private database error' },
      cleanupError: { message: 'private cleanup error' },
    });
    client.auth.admin.deleteUser.mockResolvedValue({
      error: { message: 'private auth error' },
    });

    const response = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => 'one-time-test-password',
    });

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('PATIENT_CREATION_RECOVERY_REQUIRED');
    expect(body).not.toContain('one-time-test-password');
    expect(body).not.toContain('private');
  });

  it('does not log the temporary password and has no read endpoint for it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeAdminClient();

    const creationResponse = await createPatient(request(validPatient), {
      authenticate: vi.fn().mockResolvedValue(adminContext()),
      createAdminClient: () => client,
      createPassword: () => 'one-time-test-password',
    });
    const profileReadsBeforeGet = client.from.mock.calls.length;
    const readResponse = await createPatient(request(undefined, 'GET'), {
      authenticate: vi.fn(),
      createAdminClient: vi.fn(),
    });

    expect(creationResponse.status).toBe(201);
    expect(readResponse.status).toBe(405);
    expect(client.from).toHaveBeenCalledTimes(profileReadsBeforeGet);
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('generateTemporaryPassword', () => {
  it('generates a cryptographically-selected password of the requested length', () => {
    const chooseIndex = vi.fn(() => 0);

    expect(generateTemporaryPassword({ length: 20, chooseIndex })).toBe(
      'A'.repeat(20),
    );
    expect(chooseIndex).toHaveBeenCalledTimes(20);
    expect(chooseIndex).toHaveBeenCalledWith(expect.any(Number));
  });

  it('rejects unsafe output lengths', () => {
    expect(() => generateTemporaryPassword({ length: 15 })).toThrow(RangeError);
    expect(() => generateTemporaryPassword({ length: 129 })).toThrow(RangeError);
  });
});
