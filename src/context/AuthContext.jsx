import { createContext, useContext, useEffect, useState } from 'react';
import {
  changeRequiredPassword as updateRequiredPassword,
  restoreSession,
  signIn as authenticate,
  signOut as clearSession,
} from '../services/authService.js';
import { getSupabaseClient } from '../services/supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    status: 'loading',
    session: null,
    profile: null,
    mustChangePassword: false,
    error: '',
  });

  useEffect(() => {
    let active = true;
    let subscription;

    async function initialize() {
      try {
        const restored = await restoreSession();
        if (active) {
          setAuth({
            status: restored
              ? restored.mustChangePassword
                ? 'password_change_required'
                : 'authenticated'
              : 'unauthenticated',
            session: restored?.session ?? null,
            profile: restored?.profile ?? null,
            mustChangePassword: restored?.mustChangePassword ?? false,
            error: '',
          });
        }
      } catch (error) {
        if (active) {
          setAuth({
            status: 'unauthenticated',
            session: null,
            profile: null,
            mustChangePassword: false,
            error: error.message,
          });
        }
      }
    }

    try {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && active) {
          setAuth({
            status: 'unauthenticated',
            session: null,
            profile: null,
            mustChangePassword: false,
            error: '',
          });
        }
      });
      subscription = data.subscription;
      initialize();
    } catch (error) {
      setAuth({
        status: 'unauthenticated',
        session: null,
        profile: null,
        mustChangePassword: false,
        error: error.message,
      });
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    setAuth((current) => ({ ...current, status: 'authenticating', error: '' }));

    try {
      const result = await authenticate(email, password);
      setAuth({
        status: result.mustChangePassword
          ? 'password_change_required'
          : 'authenticated',
        session: result.session,
        profile: result.profile,
        mustChangePassword: result.mustChangePassword,
        error: '',
      });
      return result;
    } catch (error) {
      setAuth({
        status: 'unauthenticated',
        session: null,
        profile: null,
        mustChangePassword: false,
        error: error.message,
      });
      throw error;
    }
  }

  async function completePasswordChange(password) {
    if (!auth.session || !auth.mustChangePassword) {
      throw new Error('No required password change is pending.');
    }

    const result = await updateRequiredPassword(auth.session, password);
    if (!result.profile || result.mustChangePassword) {
      throw new Error('Password setup is not confirmed yet. Please try again.');
    }

    return result.profile;
  }

  function finishPasswordChange(profile) {
    if (!auth.session || !auth.mustChangePassword || !profile) {
      throw new Error('Password setup is not confirmed yet. Please try again.');
    }

    setAuth({
      status: 'authenticated',
      session: auth.session,
      profile: result.profile,
      mustChangePassword: false,
      error: '',
    });
  }

  async function signOut() {
    let logoutError;
    try {
      await clearSession();
    } catch (error) {
      logoutError = error;
    } finally {
      setAuth({
        status: 'unauthenticated',
        session: null,
        profile: null,
        mustChangePassword: false,
        error: logoutError?.message ?? '',
      });
    }

    if (logoutError) {
      throw logoutError;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        signIn,
        signOut,
        completePasswordChange,
        finishPasswordChange,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
