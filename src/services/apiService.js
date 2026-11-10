const USERS_ENDPOINT = 'https://jsonplaceholder.typicode.com/users';

export async function getUsers({ signal } = {}) {
  const response = await fetch(USERS_ENDPOINT, { signal });

  if (!response.ok) {
    throw new Error(`The sample API returned an error (${response.status}).`);
  }

  const users = await response.json();

  if (!Array.isArray(users)) {
    throw new Error('The sample API returned data in an unexpected format.');
  }

  return users;
}
