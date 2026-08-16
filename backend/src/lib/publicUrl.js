// The public https:// address of this server.
//
// Carriers fetch things from us — Plivo fetches the call document, and a voice
// broadcast makes them fetch the audio file itself. Both need an address that is
// reachable from the public internet, and this deployment already has exactly
// one such setting: PUBLIC_BACKEND_WS_URL, the websocket origin the media
// bridges are reached on. It is the same server, so a second hand-typed URL
// would only be somewhere for a typo to hide — the carrier-facing endpoints
// derive from it (see exotel.provider.js and plivo.provider.js, which each did
// this inline before there was a second caller).
//
// PUBLIC_BACKEND_URL overrides it, for the one deployment shape where the HTTP
// hostname genuinely differs from the websocket one.

import { env } from '../config/env.js';

/**
 * @returns {string} e.g. "https://api.example.com", or '' when nothing is
 *   configured — callers must treat empty as "this feature cannot work here"
 *   and say so, rather than emitting a relative URL a carrier will never fetch.
 */
export function publicHttpBase() {
  const explicit = process.env.PUBLIC_BACKEND_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const ws = env.PUBLIC_BACKEND_WS_URL || '';
  if (!ws) return '';
  return ws
    .replace(/^ws(s)?:\/\//i, (_m, s) => (s ? 'https://' : 'http://'))
    .replace(/\/$/, '');
}
