import { randomInt } from 'node:crypto';

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
const DEFAULT_PASSWORD_LENGTH = 24;

export function generateTemporaryPassword({
  length = DEFAULT_PASSWORD_LENGTH,
  chooseIndex = randomInt,
} = {}) {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new RangeError('Temporary password length must be between 16 and 128.');
  }

  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_ALPHABET[chooseIndex(PASSWORD_ALPHABET.length)];
  }

  return password;
}
