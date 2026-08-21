// Can a given Voice row be spoken down a phone line?
//
// This is the check that decided, for one afternoon in production, that every
// cloned voice was telephony-incapable — because a clone's row says its provider
// is `Custom`, and `Custom` is a billing label, not a synthesizer. The modular
// phone bridge turned that "no" into a thrown error at the top of its `start`
// handler, so the callee picked up, heard about a second of nothing, and the
// line dropped.
//
// The tests below pin the one property that keeps that from coming back: the
// question is always asked of the provider that will REALLY speak the voice.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  synthesisProviderForVoice,
  telephonyFormatForVoice,
  voiceSupportsTelephony,
} from '../telephonyVoice.js';

/** A cloned voice as voiceClone.controller.js writes it. */
const clone = (clonedProvider, { status = 'cloned', clonedVoiceId = 'up-123' } = {}) => ({
  name: 'krishna',
  provider: { name: 'Custom' },
  providerVoiceId: clonedVoiceId,
  metadata: JSON.stringify({ status, clonedProvider, clonedVoiceId }),
});

const catalogue = (providerName) => ({
  name: 'Rachel',
  provider: { name: providerName },
  providerVoiceId: 'v-1',
  metadata: '{}',
});

describe('synthesisProviderForVoice', () => {
  test('sees past the synthetic Custom provider to the clone host', () => {
    assert.equal(synthesisProviderForVoice(clone('fishaudio')), 'FishAudio');
    assert.equal(synthesisProviderForVoice(clone('elevenlabs')), 'ElevenLabs');
  });

  test('a catalogue voice is its own provider', () => {
    assert.equal(synthesisProviderForVoice(catalogue('Sarvam')), 'Sarvam');
    assert.equal(synthesisProviderForVoice(catalogue('Cartesia')), 'Cartesia');
  });

  test('a clone that never finished training can synthesize nothing', () => {
    // Deliberately NOT the fallback: guessing a provider for a voice that cannot
    // speak would put the failure back on a live call, which is the whole point
    // of asking before dialling.
    assert.equal(synthesisProviderForVoice(clone('fishaudio', { status: 'sample_only' }), 'ElevenLabs'), '');
  });

  test('no voice row at all falls back to the configured provider', () => {
    assert.equal(synthesisProviderForVoice(null, 'ElevenLabs'), 'ElevenLabs');
    assert.equal(synthesisProviderForVoice(null), '');
  });
});

describe('telephonyFormatForVoice', () => {
  test('a Fish-hosted clone gets Fish Audio\'s telephony format, not null', () => {
    // The exact regression: this returned null for every clone, and the bridge
    // read null as "hang up".
    assert.deepEqual(telephonyFormatForVoice(clone('fishaudio')), {
      kind: 'pcm', format: 'pcm', rate: 8000,
    });
  });

  test('an ElevenLabs-hosted clone gets native mu-law', () => {
    assert.deepEqual(telephonyFormatForVoice(clone('elevenlabs')), {
      kind: 'native', format: 'ulaw_8000',
    });
  });

  test('a genuinely MP3-only provider is still refused', () => {
    // The guard has to keep saying no where no is the right answer — Cartesia
    // and Google ignore audioFormat today, so their bytes would reach a carrier
    // as noise. See TELEPHONY_TTS in telephonyAudio.js.
    assert.equal(telephonyFormatForVoice(catalogue('Cartesia')), null);
    assert.equal(telephonyFormatForVoice(catalogue('Google')), null);
  });

  test('an untrained clone is refused, whatever the fallback says', () => {
    assert.equal(telephonyFormatForVoice(clone('fishaudio', { status: 'sample_only' }), 'ElevenLabs'), null);
  });
});

describe('voiceSupportsTelephony', () => {
  test('agrees with telephonyFormatForVoice on every case', () => {
    for (const v of [
      clone('fishaudio'), clone('elevenlabs'), clone('fishaudio', { status: 'sample_only' }),
      catalogue('Sarvam'), catalogue('Cartesia'), catalogue('Google'), catalogue('ElevenLabs'),
    ]) {
      assert.equal(voiceSupportsTelephony(v), telephonyFormatForVoice(v) !== null);
    }
  });
});
