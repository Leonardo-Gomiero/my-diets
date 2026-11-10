// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeRequiredPassword,
  restoreSession,
  signIn,
  signOut,
} from '../services/authService.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';

vi.mock('../services/authService.js', () => ({
  changeRequiredPassword: vi.fn(),
  restoreSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../services/supabaseClient.js', () => ({
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

const session = {
  access_token: 'test-token',
  user: { id: 'student-id' },
};

const profile = {
  id: 'student-id',
  role: 'STUDENT',
  is_active: true,
  must_change_password: false,
};

function PasswordChangeConsumer() {
  const {
    status,
    profile: currentProfile,
    completePasswordChange,
    finishPasswordChange,
  } = useAuth();

  async function completeChange() {
    try {
      const result = await completePasswordChange('new-test-password');
      finishPasswordChange(result);
    } catch (error) {
      document.querySelector('[data-error]').textContent = error.message;
    }
  }

  return (
    <>
      <p data-status>{status}</p>
      <p data-profile>{currentProfile?.role ?? 'no profile'}</p>
      <p data-error />
      <button type="button" onClick={completeChange}>
        Complete password change
      </button>
    </>
  );
}

describe('AuthContext required password change', () => {
  beforeEach(() => {
    restoreSession.mockResolvedValue({
      session,
      profile: null,
      mustChangePassword: true,
    });
    changeRequiredPassword.mockResolvedValue({
      session,
      profile,
      mustChangePassword: false,
    });
  });

  it('updates the authenticated profile after the server confirms the change', async () => {
    render(
      <AuthProvider>
        <PasswordChangeConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('password_change_required')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete password change' }));

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeTruthy();
      expect(screen.getByText('STUDENT')).toBeTruthy();
    });
    expect(screen.getByText('', { selector: '[data-error]' }).textContent).toBe('');
  });
});
