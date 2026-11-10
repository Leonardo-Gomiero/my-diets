import { describe, expect, it, vi } from 'vitest';
import {
  changeRequiredPassword,
  getApplicationProfile,
  restoreSession,
  signIn,
  signOut,
} from './authService.js';

const session = {
  access_token: 'test-access-token',
  user: { id: 'user-id', email: 'person@example.test' },
};

const profile = {
  id: 'user-id',
  role: 'ADMIN',
  is_active: true,
  must_change_password: false,
};

const passwordChangeRequired = {
  error: {
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'Change your password before accessing this resource.',
  },
};

function fakeClient({
  signInResult = { data: { session }, error: null },
  getSessionResult = { data: { session: null }, error: null },
  signOutResult = { error: null },
} = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(signInResult),
      getSession: vi.fn().mockResolvedValue(getSessionResult),
      signOut: vi.fn().mockResolvedValue(signOutResult),
    },
  };
}

function profileResponse({ body = { data: { profile } }, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe('Supabase Auth integration', () => {
  it('signs in with Supabase, validates the profile using the bearer token', async () => {
    const client = fakeClient();
    const fetchImpl = profileResponse();

    await expect(
      signIn(' PERSON@EXAMPLE.TEST ', 'secret', { client, fetchImpl }),
    ).resolves.toEqual({
      session,
      profile,
      mustChangePassword: false,
    });

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'secret',
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/me', {
      headers: { Authorization: 'Bearer test-access-token' },
    });
  });

  it('keeps a forced-change student signed in only for the password flow', async () => {
    const client = fakeClient();
    const fetchImpl = profileResponse({
      body: passwordChangeRequired,
      status: 403,
    });

    await expect(
      signIn('person@example.test', 'temporary', { client, fetchImpl }),
    ).resolves.toEqual({
      session,
      profile: null,
      mustChangePassword: true,
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out the session if the application profile is invalid', async () => {
    const client = fakeClient();
    const fetchImpl = profileResponse({
      body: { data: { profile: { ...profile, role: 'UNKNOWN' } } },
    });

    await expect(
      signIn('person@example.test', 'secret', { client, fetchImpl }),
    ).rejects.toThrow('Your account could not be verified.');

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not grant access after profile verification fails over the network', async () => {
    const client = fakeClient();

    await expect(
      signIn('person@example.test', 'secret', {
        client,
        fetchImpl: vi.fn().mockRejectedValue(new Error('private network detail')),
      }),
    ).rejects.toThrow('Unable to verify your account right now.');

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('restores an absent session without making an API request', async () => {
    const client = fakeClient();
    const fetchImpl = vi.fn();

    await expect(restoreSession({ client, fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('signs out from Supabase instead of clearing a mock localStorage key', async () => {
    const client = fakeClient();

    await expect(signOut({ client })).resolves.toBeUndefined();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects missing and malformed application profiles', async () => {
    for (const body of [
      { data: { profile: null } },
      { data: { profile: { ...profile, is_active: false } } },
      { data: { profile: { ...profile, id: 'another-user' } } },
    ]) {
      await expect(
        getApplicationProfile(session, {
          fetchImpl: profileResponse({ body }),
        }),
      ).rejects.toThrow('Your account could not be verified.');
    }
  });

  it('only treats the explicit password-change response as a forced change', async () => {
    await expect(
      getApplicationProfile(session, {
        fetchImpl: profileResponse({
          body: passwordChangeRequired,
          status: 403,
        }),
      }),
    ).resolves.toEqual({ profile: null, mustChangePassword: true });

    await expect(
      getApplicationProfile(session, {
        fetchImpl: profileResponse({
          body: { error: { code: 'ACCOUNT_INACTIVE' } },
          status: 403,
        }),
      }),
    ).rejects.toThrow('Your account could not be verified.');
  });

  it('confirms password completion by reloading the profile after the endpoint', async () => {
    const refreshedSession = {
      access_token: 'refreshed-access-token',
      user: session.user,
    };
    const client = fakeClient({
      signInResult: { data: { session: refreshedSession }, error: null },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: { password_change_required: false },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: { profile } }),
      });

    await expect(
      changeRequiredPassword(session, 'a-long-test-password', { client, fetchImpl }),
    ).resolves.toEqual({
      profile,
      mustChangePassword: false,
      session: refreshedSession,
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: session.user.email,
      password: 'a-long-test-password',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/me/password',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toContain(
      refreshedSession.access_token,
    );
  });

  it('keeps forced access when the password changed but profile clearing is pending', async () => {
    const client = fakeClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({
          error: { code: 'PASSWORD_PROFILE_UPDATE_PENDING' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue(passwordChangeRequired),
      });

    await expect(
      changeRequiredPassword(session, 'a-long-test-password', { client, fetchImpl }),
    ).rejects.toThrow('password was changed, but account setup is still pending');
  });

  it('rejects a network failure while restoring an existing session', async () => {
    const client = fakeClient({
      getSessionResult: { data: { session }, error: null },
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(restoreSession({ client, fetchImpl })).rejects.toThrow(
      'Unable to verify your account right now.',
    );
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
