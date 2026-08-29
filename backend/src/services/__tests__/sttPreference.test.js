// The bug these pin: the batch STT fallback sorted its providers by matching
// the agent's stored setting LITERALLY. The editor stores catalogue values —
// `deepgram_stream`, `Sarvam`, `Standard Providers` — so an agent set to
// Deepgram produced the string "deepgram_stream", which equalled neither
// "sarvam" nor "elevenlabs". The sort was a no-op, Sarvam always ran first, and
// the resulting error named two providers the operator had never selected:
//
//   All STT providers failed: sarvam: Sarvam STT HTTP 400 … | elevenlabs: …
//
// Deepgram was not in the chain at all, despite being the configured provider
// and having a pre-recorded endpoint.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSttPreference } from '../stt.service.js';

describe('normalizeSttPreference', () => {
  test('recognises the catalogue values the editor actually stores', () => {
    // These are the exact `value` fields from the platform STT catalogue.
    assert.equal(normalizeSttPreference('deepgram_stream'), 'deepgram');
    assert.equal(normalizeSttPreference('Sarvam'), 'sarvam');
  });

  test('is case- and shape-insensitive, which is why the old match failed', () => {
    for (const v of ['Deepgram', 'DEEPGRAM', ' deepgram_stream ', 'Deepgram (streaming)']) {
      assert.equal(normalizeSttPreference(v), 'deepgram', `"${v}"`);
    }
    for (const v of ['ElevenLabs', 'elevenlabs', 'Eleven Labs']) {
      assert.equal(normalizeSttPreference(v), 'elevenlabs', `"${v}"`);
    }
  });

  test('returns null for a provider this fallback cannot do', () => {
    // Azure and Soniox are selectable in the catalogue but have no batch
    // implementation here. Null is what lets the caller SAY so, instead of
    // silently running someone else and reporting their failure as yours.
    assert.equal(normalizeSttPreference('Azure'), null);
    assert.equal(normalizeSttPreference('Soniox'), null);
    assert.equal(normalizeSttPreference('Standard Providers'), null);
  });

  test('handles an unset or malformed setting without throwing', () => {
    for (const v of ['', '   ', null, undefined, 0, false, {}, []]) {
      assert.equal(normalizeSttPreference(v), null, `"${String(v)}"`);
    }
  });
});
