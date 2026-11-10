import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  authenticateRequest,
  requireActiveAccount,
  requireAdmin,
  requirePasswordChangeComplete,
  requireRole,
} from './auth.js';
import {
  createServerSupabaseClient,
  createTokenVerifierClient,
} from './supabase.js';
import { errorResponse, HttpError, successResponse } from './http.js';

const user = { id: 'auth-user-id' };
const activeStudent = {
  id: user.id,
  role: 'STUDENT',
  is_active: true,
  must_change_password: false,
};

function request(authorization = 'Bearer test-token') {
  return new Request('https://example.test/api/resource', {
    headers: authorization ? { authorization } : {},
  });
}

function profileClient(result) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from },
    from,
    select,
    eq,
    maybeSingle,
  };
}

function verifierClient(result) {
  return { auth: { getUser: vi.fn().mockResolvedValue(result) } };
}

describe('authenticateRequest', () => {
  it('verifies a bearer token and loads only its matching profile', async () => {
    const verifier = verifierClient({ data: { user }, error: null });
    const profile = profileClient({ data: activeStudent, error: null });
    const createVerifierClient = vi.fn(() => verifier);
    const createProfileClient = vi.fn(() => profile.client);

    await expect(
      authenticateRequest(request(), {
        createVerifierClient,
        createProfileClient,
      }),
    ).resolves.toEqual({ user, profile: activeStudent });

    expect(verifier.auth.getUser).toHaveBeenCalledWith('test-token');
    expect(profile.from).toHaveBeenCalledWith('profiles');
    expect(profile.select).toHaveBeenCalledWith(
      'id, full_name, role, is_active, must_change_password, nutritionist_id, nutritionist_details(phone)',
    );
    expect(profile.eq).toHaveBeenCalledWith('id', user.id);
  });

  it.each([null, 'Basic test-token', 'Bearer', 'Bearer token extra'])(
    'rejects malformed or absent authorization headers: %s',
    async (authorization) => {
      await expect(
        authenticateRequest(request(authorization), {
          createVerifierClient: vi.fn(),
          createProfileClient: vi.fn(),
        }),
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    },
  );

  it('maps rejected tokens to a safe 401 response', async () => {
    const createVerifierClient = vi.fn(() =>
      verifierClient({
        data: { user: null },
        error: { status: 401, message: 'sensitive auth provider detail' },
      }),
    );

    await expect(
      authenticateRequest(request(), { createVerifierClient }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('does not expose authentication provider failures', async () => {
    const createVerifierClient = vi.fn(() =>
      verifierClient({
        data: { user: null },
        error: { status: 500, message: 'private upstream response' },
      }),
    );

    await expect(
      authenticateRequest(request(), { createVerifierClient }),
    ).rejects.toMatchObject({
      status: 503,
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
  });

  it('rejects users without a matching application profile', async () => {
    await expect(
      authenticateRequest(request(), {
        createVerifierClient: () =>
          verifierClient({ data: { user }, error: null }),
        createProfileClient: () =>
          profileClient({ data: null, error: null }).client,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'PROFILE_NOT_FOUND' });
  });

  it('rejects inactive accounts before the forced password-change exception', async () => {
    const inactivePendingStudent = {
      ...activeStudent,
      is_active: false,
      must_change_password: true,
    };

    await expect(
      authenticateRequest(request(), {
        createVerifierClient: () =>
          verifierClient({ data: { user }, error: null }),
        createProfileClient: () =>
          profileClient({ data: inactivePendingStudent, error: null }).client,
        allowPasswordChange: true,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_INACTIVE',
    });
  });

  it('does not expose profile database errors', async () => {
    await expect(
      authenticateRequest(request(), {
        createVerifierClient: () =>
          verifierClient({ data: { user }, error: null }),
        createProfileClient: () =>
          profileClient({
            data: null,
            error: { message: 'private database detail' },
          }).client,
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: 'PROFILE_LOOKUP_UNAVAILABLE',
    });
  });
});

describe('authorization helpers', () => {
  it('requires an active account and the requested role', () => {
    const context = { user, profile: activeStudent };

    expect(requireActiveAccount(context)).toBe(context);
    expect(requireRole(context, 'STUDENT')).toBe(context);
    expect(() => requireAdmin(context)).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
    expect(() =>
      requireActiveAccount({
        profile: { ...activeStudent, is_active: false },
      }),
    ).toThrow(expect.objectContaining({ code: 'ACCOUNT_INACTIVE' }));
  });

  it('blocks protected access until the password change is complete', () => {
    const context = { user, profile: activeStudent };

    expect(requirePasswordChangeComplete(context)).toBe(context);
    expect(() =>
      requirePasswordChangeComplete({
        user,
        profile: { ...activeStudent, must_change_password: true },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }),
    );
  });

  it('rejects forced-change students by default on authenticated data requests', async () => {
    const pendingStudent = {
      ...activeStudent,
      must_change_password: true,
    };
    const readDiet = vi.fn();
    const createVerifierClient = () =>
      verifierClient({ data: { user }, error: null });
    const createProfileClient = () =>
      profileClient({ data: pendingStudent, error: null }).client;

    try {
      const context = await authenticateRequest(request(), {
        createVerifierClient,
        createProfileClient,
      });
      readDiet(context);
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    expect(readDiet).not.toHaveBeenCalled();

    await expect(
      authenticateRequest(request(), {
        createVerifierClient,
        createProfileClient,
        allowPasswordChange: true,
      }),
    ).resolves.toEqual({ user, profile: pendingStudent });
  });
});

describe('Supabase server clients', () => {
  it('requires server-only configuration and rejects a VITE service key', () => {
    expect(() => createTokenVerifierClient({})).toThrow(
      'Missing server environment variable: SUPABASE_URL',
    );
    expect(() =>
      createServerSupabaseClient({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-only-key',
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'misconfigured-test-only-key',
      }),
    ).toThrow('must not use a VITE_ environment variable');
  });
});

describe('HTTP response helpers', () => {
  it('returns consistent JSON success and safe error envelopes', async () => {
    const success = successResponse({ id: 'test' });
    expect(success.status).toBe(200);
    expect(success.headers.get('content-type')).toContain('application/json');
    await expect(success.json()).resolves.toEqual({ data: { id: 'test' } });

    const knownError = errorResponse(
      new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.'),
    );
    expect(knownError.status).toBe(401);
    await expect(knownError.json()).resolves.toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });

    const unexpectedError = errorResponse(
      new Error('private database or provider detail'),
    );
    expect(unexpectedError.status).toBe(500);
    const body = await unexpectedError.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('private database');
  });
});

describe('frontend/server credential boundary', () => {
  it('keeps the service-role key and function imports out of frontend source', () => {
    const sourceRoot = fileURLToPath(new URL('../../../src/', import.meta.url));
    const files = [];

    function collectFiles(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) collectFiles(path);
        else if (/\.[jt]sx?$/.test(entry.name)) files.push(path);
      }
    }

    collectFiles(sourceRoot);
    const frontendSource = files
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(frontendSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(frontendSource).not.toMatch(/from\s+['"][^'"]*netlify\/functions/);
    expect(frontendSource).not.toMatch(/import\s*\(\s*['"][^'"]*netlify\/functions/);
  });
});
