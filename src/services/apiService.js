const USERS_ENDPOINT = 'https://jsonplaceholder.typicode.com/users';

export async function getUsers({ signal } = {}) {
  const response = await fetch(USERS_ENDPOINT, { signal });

  if (!response.ok) {
    throw new Error(`A API de exemplo retornou um erro (${response.status}).`);
  }

  const users = await response.json();

  if (!Array.isArray(users)) {
    throw new Error('A API de exemplo retornou dados em um formato inesperado.');
  }

  return users;
}
