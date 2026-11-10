const SESSION_KEY = 'my-diets-session';

export function getSession() {
  const storedSession = window.localStorage.getItem(SESSION_KEY);
  return storedSession ? JSON.parse(storedSession) : null;
}

export function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Enter your email address and password to continue.');
  }

  const session = {
    email: normalizedEmail,
    signedInAt: new Date().toISOString(),
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY);
}
