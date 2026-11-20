/**
 * password.service.js - Password hashing with Node's built-in scrypt.
 *
 * - scrypt is a deliberately SLOW, memory-hard hash, so guessing passwords is expensive.
 * - Each user gets their own random 16-byte SALT, so two users with the same password
 *   still get different hashes and pre-computed "rainbow tables" are useless.
 * - Hashes are compared with crypto.timingSafeEqual, which takes the same time whether
 *   the first or the last byte differs (prevents timing attacks).
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password, saltHex = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, SCRYPT_OPTIONS);
  return { hash: derived.toString('hex'), salt: saltHex };
}

export async function verifyPassword(password, hashHex, saltHex) {
  const { hash } = await hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** SHA-256 for tokens (session and reset tokens are random, so a fast hash is fine). */
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
