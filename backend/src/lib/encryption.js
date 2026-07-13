import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

const getKey = () => {
  const raw = env.ENCRYPTION_KEY;
  // Pad or truncate to exactly 32 bytes so dev works without a perfectly-sized key
  if (!raw) {
    // Fallback dev key — never used in production
    return Buffer.alloc(KEY_LENGTH, 'omnidim_dev_key_fallback_000000');
  }
  const padded = raw.padEnd(KEY_LENGTH, '0').slice(0, KEY_LENGTH);
  return Buffer.from(padded, 'utf8');
};

/**
 * Encrypt a plain-text string (e.g. Meta access token) for safe DB storage.
 * Output format: "<iv_hex>:<ciphertext_hex>"
 *
 * @param {string} plainText
 * @returns {string}
 */
export const encryptToken = (plainText) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypt a value that was encrypted with encryptToken.
 *
 * @param {string} cipherText  "<iv_hex>:<ciphertext_hex>"
 * @returns {string}
 */
export const decryptToken = (cipherText) => {
  const [ivHex, encryptedHex] = cipherText.split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid cipherText format — expected "<iv_hex>:<ciphertext_hex>"');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
