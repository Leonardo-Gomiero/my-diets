import { createContext, useContext, useState } from 'react';
import {
  getSession,
  login as authenticate,
  logout as clearSession,
} from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getSession);

  function signIn(email, password) {
    const nextSession = authenticate(email, password);
    setSession(nextSession);
    return nextSession;
  }

  function signOut() {
    clearSession();
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, signIn, signOut }}>
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
