// Provider registry.
//
// One place decides which carrier a call goes out on. Routing is per-number —
// `VoiceNumber.provider` — so India moves tenant by tenant and any workspace can
// be rolled back by flipping one row. TELEPHONY_PROVIDER_DEFAULT only covers
// calls placed from a number we have no record for.
//
// Twilio serves everything outside India. Exotel and Plivo both serve India and
// are kept side by side on purpose: they fail differently (Plivo is self-serve
// but its signup gates on an India-region org; Exotel is licensed UL-VNO with
// self-serve trial credits but caps sessions at 60 minutes and drops a call if a
// turn takes over 10 seconds). Having both means a carrier problem is a routing
// change, not an outage.

import { env } from '../../config/env.js';
import logger from '../../lib/logger.js';
import { twilioProvider } from './twilio.provider.js';
import { exotelProvider } from './exotel.provider.js';

const PROVIDERS = new Map([
  [twilioProvider.id, twilioProvider],
  [exotelProvider.id, exotelProvider],
]);

/** Provider ids that are actually wired up right now. */
export const availableProviders = () => [...PROVIDERS.keys()];

/**
 * Resolve a provider by id, falling back to the configured default.
 *
 * An unknown id falls back rather than throwing: a bad `VoiceNumber.provider`
 * value should degrade to the default carrier and a loud log line, not take the
 * dialer down mid-campaign.
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

export { twilioProvider, exotelProvider };
