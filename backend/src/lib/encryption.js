import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';
import logger from './logger.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

let warnedAboutFallbackKey = false;

const getKey = () => {
  const raw = env.ENCRYPTION_KEY;
  // Pad or truncate to exactly 32 bytes so dev works without a perfectly-sized key
  if (!raw) {
    // Fallback dev key. The old comment said "never used in production", but
    // nothing enforced that. Deliberately NOT a throw: a deployment already
    // running without the variable has encrypted real tokens with this key, and
    // refusing to boot would make every one of them undecryptable at once. It
    // does shout, once per process, so the gap cannot go unnoticed.
    if (env.NODE_ENV === 'production' && !warnedAboutFallbackKey) {
      warnedAboutFallbackKey = true;
      logger.error(
        'ENCRYPTION_KEY is not set: integration tokens and carrier credentials are being encrypted with the '
        + 'built-in development key, which is public in the repository. Set ENCRYPTION_KEY only after '
        + 're-encrypting the existing ciphertexts with it, or they will stop decrypting.',
      );
    }
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
