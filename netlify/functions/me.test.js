import { describe, expect, it, vi } from 'vitest';
import me from './me.js';
import { HttpError } from './_shared/http.js';

function request(method = 'GET') {
  return new Request('https://example.test/api/me', {
    method,
    headers: { Authorization: 'Bearer test-token' },
  });
}

describe('GET /api/me', () => {
  it('returns only the authenticated user and application profile', async () => {
    const context = {
      user: { id: 'auth-user-id', email: 'person@example.test' },
      profile: {
        id: 'auth-user-id',
        role: 'ADMIN',
        is_active: true,
        must_change_password: false,
      },
    };

    const response = await me(request(), {
      authenticate: vi.fn().mockResolvedValue(context),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: context });
  });

  it('rejects inactive accounts and invalid roles', async () => {
    for (const profile of [
      { id: 'auth-user-id', role: 'ADMIN', is_active: false },
      { id: 'auth-user-id', role: 'UNKNOWN', is_active: true },
    ]) {
      const response = await me(request(), {
        authenticate: vi.fn().mockResolvedValue({
          user: { id: 'auth-user-id' },
          profile,
        }),
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty('error');
    }
  });

  it('does not return a protected profile during a required password change', async () => {
    const response = await me(request(), {
      authenticate: vi.fn().mockRejectedValue(
        new HttpError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Change your password before accessing this resource.',
        ),
      ),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(body).not.toHaveProperty('data');
  });

  it('rejects unsupported methods', async () => {
    const response = await me(request('POST'));
    expect(response.status).toBe(405);
  });
});
