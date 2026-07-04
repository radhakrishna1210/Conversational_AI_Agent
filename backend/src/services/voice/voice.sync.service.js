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

// Map provider display names → provider module
const PROVIDERS = {
  Google: googleProvider,
  ElevenLabs: elevenLabsProvider,
  Sarvam: sarvamProvider,
  Cartesia: cartesiaProvider,
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

    for (const dto of dtos) {
      const existing = await prisma.voice.findUnique({
        where: {
          providerId_providerVoiceId: {
            providerId: providerRow.id,
            providerVoiceId: dto.providerVoiceId,
          },
        },
        select: { id: true },
      });

      await prisma.voice.upsert({
        where: {
          providerId_providerVoiceId: {
            providerId: providerRow.id,
            providerVoiceId: dto.providerVoiceId,
          },
        },
        create: {
          providerId: providerRow.id,
          providerVoiceId: dto.providerVoiceId,
          name: dto.name,
          language: dto.language || null,
          accent: dto.accent || null,
          gender: dto.gender || null,
          category: dto.category || null,
          metadata: dto.metadata || null,
        },
        update: {
          name: dto.name,
          language: dto.language || null,
          accent: dto.accent || null,
          gender: dto.gender || null,
          category: dto.category || null,
          metadata: dto.metadata || null,
        },
      });

      if (existing) updated++;
      else added++;
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
