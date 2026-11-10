import { createContext, useContext, useEffect, useState } from 'react';
import {
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
            status: restored ? 'authenticated' : 'unauthenticated',
            session: restored?.session ?? null,
            profile: restored?.profile ?? null,
            error: '',
          });
        }
      } catch (error) {
        if (active) {
          setAuth({
            status: 'unauthenticated',
            session: null,
            profile: null,
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
        status: 'authenticated',
        session: result.session,
        profile: result.profile,
        error: '',
      });
      return result;
    } catch (error) {
      setAuth({
        status: 'unauthenticated',
        session: null,
        profile: null,
        error: error.message,
      });
      throw error;
    }
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
        error: logoutError?.message ?? '',
      });
    }

    if (logoutError) {
      throw logoutError;
    }
  }

  return (
    <AuthContext.Provider value={{ ...auth, signIn, signOut }}>
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
