// Provider registry.
//
// One place decides which carrier a call goes out on. Routing is per-number —
// `VoiceNumber.provider` — so India moves tenant by tenant and any workspace can
// be rolled back by flipping one row. TELEPHONY_PROVIDER_DEFAULT only covers
// calls placed from a number we have no record for.
//
// Twilio serves everything outside India; Plivo serves India, which Twilio
// cannot legally carry. Exotel was a second India carrier here until it was
// removed — it capped sessions at 60 minutes, dropped a call if a turn took
// over 10 seconds, and never carried live traffic. Its replacement as the
// India fallback is PIOPIY, which is not in this map yet: it is blocked on
// account credentials, so resolveProvider() still falls back to Twilio for it.

import { env } from '../../config/env.js';
import logger from '../../lib/logger.js';
import { twilioProvider } from './twilio.provider.js';
import { plivoProvider } from './plivo.provider.js';

const PROVIDERS = new Map([
  [twilioProvider.id, twilioProvider],
  [plivoProvider.id, plivoProvider],
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

export { twilioProvider, plivoProvider };
