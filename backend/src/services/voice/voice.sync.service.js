// backend/src/services/voice/voice.sync.service.js
/**
 * VoiceSyncService – fetches voices from configured providers and upserts
 * them into the database.
 *
 * Upsert key: composite (providerId, providerVoiceId)
 * Updates VoiceProvider.lastSyncedAt after each successful sync.
 * Returns { added, updated, total, provider }
 */

import prisma from '../../config/prisma.js';
import * as googleProvider from './providers/google.provider.js';
import * as elevenLabsProvider from './providers/elevenlabs.provider.js';
import * as sarvamProvider from './providers/sarvam.provider.js';
import * as cartesiaProvider from './providers/cartesia.provider.js';
import * as fishAudioProvider from './providers/fishaudio.provider.js';

// Map provider display names → provider module
export const PROVIDERS = {
  Google: googleProvider,
  ElevenLabs: elevenLabsProvider,
  Sarvam: sarvamProvider,
  Cartesia: cartesiaProvider,
  FishAudio: fishAudioProvider,
};

/**
 * Ensure the VoiceProvider row exists for the given name, creating it if needed.
 * @param {string} name – e.g. "Google" or "ElevenLabs"
 * @returns {Promise<{id: string, name: string}>}
 */
async function ensureProvider(name) {
  return prisma.voiceProvider.upsert({
    where: { name },
    create: { name, isActive: true },
    update: {},
    select: { id: true, name: true },
  });
}

/**
 * Sync voices for one provider.
 * @param {string} providerName  – "Google" | "ElevenLabs"
 * @returns {Promise<{ provider: string, added: number, updated: number, total: number, error?: string }>}
 */
export async function syncProvider(providerName) {
  const module = PROVIDERS[providerName];
  if (!module) throw new Error(`Unknown provider: ${providerName}`);

  const providerRow = await ensureProvider(providerName);
  let added = 0;
  let updated = 0;

  try {
    const dtos = await module.getVoices();

    // ONE query for what already exists, instead of a findUnique per voice: the
    // loop below used to fire 2 sequential round-trips per voice purely to tell
    // added from updated, which is ~1s each against a remote Postgres. That was
    // survivable at 60 voices and is not at several hundred — the sync request
    // times out long before the catalogue lands.
    const existingIds = new Set(
      (await prisma.voice.findMany({
        where: { providerId: providerRow.id },
        select: { providerVoiceId: true },
      })).map((v) => v.providerVoiceId),
    );

    const fields = (dto) => ({
      name: dto.name,
      language: dto.language || null,
      accent: dto.accent || null,
      gender: dto.gender || null,
      category: dto.category || null,
      metadata: dto.metadata || null,
    });

    // Write in bounded batches: fully parallel would open a connection per voice
    // and exhaust the pool, fully sequential is the round-trip problem above.
    const BATCH = 20;
    for (let i = 0; i < dtos.length; i += BATCH) {
      const batch = dtos.slice(i, i + BATCH);
      // eslint-disable-next-line no-await-in-loop -- bounded concurrency is the point
      await Promise.all(batch.map((dto) => prisma.voice.upsert({
        where: {
          providerId_providerVoiceId: {
            providerId: providerRow.id,
            providerVoiceId: dto.providerVoiceId,
          },
        },
        create: { providerId: providerRow.id, providerVoiceId: dto.providerVoiceId, ...fields(dto) },
        update: fields(dto),
      })));
      for (const dto of batch) {
        if (existingIds.has(dto.providerVoiceId)) updated++;
        else added++;
      }
    }

    // Update lastSyncedAt
    await prisma.voiceProvider.update({
      where: { id: providerRow.id },
      data: { lastSyncedAt: new Date() },
    });

    return { provider: providerName, added, updated, total: dtos.length };
  } catch (err) {
    return {
      provider: providerName,
      added,
      updated,
      total: added + updated,
      error: err.message,
    };
  }
}

/**
 * Sync all providers (or just one if providerName is provided).
 * @param {string} [providerName] – optional filter; syncs all if omitted
 * @returns {Promise<Object[]>} – array of per-provider sync results
 */
export async function syncVoices(providerName) {
  const names = providerName ? [providerName] : Object.keys(PROVIDERS);
  const results = await Promise.allSettled(names.map(n => syncProvider(n)));
  return results.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : { provider: 'unknown', added: 0, updated: 0, total: 0, error: r.reason?.message }
  );
}
