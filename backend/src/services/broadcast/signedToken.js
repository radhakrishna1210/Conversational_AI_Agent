// Capability tokens for the two broadcast endpoints a carrier has to reach.
//
// Neither can hold a session: the carrier fetches the audio file when a call is
// answered, and posts the call's outcome when it ends. So the authorisation has
// to travel in the URL, and it has to be unforgeable — an enumerable
// /broadcast-audio/<id> would leak every customer's marketing audio, and an
// unauthenticated status endpoint would let anyone mark calls answered and
// billed.
//
// One HMAC over (purpose, id). The purpose is mixed in so a token minted for the
// audio file cannot be replayed against the status endpoint.

import crypto from 'crypto';
import { env } from '../../config/env.js';

/**
 * Falls back to the access-token secret rather than to a constant: this needs a
 * server-side secret that exists in every environment, and a hardcoded default
 * would make every deployment's tokens forgeable by anyone who read this file.
 */
const signingKey = () => process.env.BROADCAST_AUDIO_SECRET || env.JWT_ACCESS_SECRET || '';

/** @param {'audio'|'status'} purpose */
export const signToken = (purpose, id) =>
  crypto.createHmac('sha256', signingKey())
    .update(`broadcast:${purpose}:${id}`)
    .digest('hex')
    .slice(0, 32);

/** Constant-time, so the token cannot be recovered a byte at a time. */
export function verifyToken(purpose, id, token) {
  const expected = signToken(purpose, id);
  const given = String(token || '');
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
