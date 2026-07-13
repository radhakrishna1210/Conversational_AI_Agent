import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { API_KEY_RANDOM_BYTES } from '../constants/limits.js';

export const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);

export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

export const generateApiKey = (prefix = 'sk_live') => {
  const raw = `${prefix}_${randomBytes(API_KEY_RANDOM_BYTES).toString('hex')}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
};

export const generateSecureToken = (bytes = 32) =>
  randomBytes(bytes).toString('hex');
