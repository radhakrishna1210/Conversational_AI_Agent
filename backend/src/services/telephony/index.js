// Provider registry.
//
// One place decides which carrier a call goes out on. Routing is per-number —
// `VoiceNumber.provider` — so India moves tenant by tenant and any workspace can
// be rolled back by flipping one row. TELEPHONY_PROVIDER_DEFAULT only covers
// calls placed from a number we have no record for.
//
// Twilio serves everything outside India; Plivo and PIOPIY serve India, which
// Twilio cannot legally carry. Exotel was a third India carrier here until it
// was removed — it capped sessions at 60 minutes, dropped a call if a turn took
// over 10 seconds, and never carried live traffic. PIOPIY fills that slot.
//
// PIOPIY is registered here even while its credentials are still empty. Leaving
// it out was the more cautious-looking option and was the worse one: an unknown
// id falls back to Twilio, so a +91 VoiceNumber marked PIOPIY dialled out over a
// carrier that cannot legally carry Indian domestic traffic, silently and under
// the wrong caller ID. Registered, the same row is refused by status() before it
// dials, with text that names the credential to set — every dial path checks
// status() first (outboundCall.service.js, broadcastCall.service.js). An
// unconfigured carrier should fail loudly, not reroute.

import { env } from '../../config/env.js';
import logger from '../../lib/logger.js';
import { twilioProvider } from './twilio.provider.js';
import { plivoProvider } from './plivo.provider.js';
import { piopiyProvider } from './piopiy.provider.js';

const PROVIDERS = new Map([
  [twilioProvider.id, twilioProvider],
  [plivoProvider.id, plivoProvider],
  [piopiyProvider.id, piopiyProvider],
]);

/** Provider ids that are actually wired up right now. */
export const availableProviders = () => [...PROVIDERS.keys()];

/**
 * Resolve a provider by id, falling back to the configured default.
 *
 * An unknown id falls back rather than throwing: a bad `VoiceNumber.provider`
 * value should degrade to the default carrier and a loud log line, not take the
 * dialer down mid-campaign. Numbers still recorded as EXOTEL — if any survive
 * the carrier's removal — land here and go out on Twilio.
 *
 * @param {string} [providerId]
 * @returns {import('./provider.interface.js').TelephonyProvider}
 */
export function resolveProvider(providerId) {
  const requested = String(providerId || env.TELEPHONY_PROVIDER_DEFAULT || 'TWILIO').toUpperCase();
  const provider = PROVIDERS.get(requested);
  if (provider) return provider;

  logger.warn(
    `Unknown telephony provider "${requested}" — falling back to ${twilioProvider.id}. `
    + `Wired providers: ${availableProviders().join(', ')}.`,
  );
  return twilioProvider;
}

export { twilioProvider, plivoProvider, piopiyProvider };
