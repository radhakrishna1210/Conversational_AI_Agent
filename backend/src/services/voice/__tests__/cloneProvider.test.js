// Which provider trains — and therefore speaks, and therefore bills — a clone.
//
// The Clone Voice page prints this answer before the upload, so the resolver has
// to give the same answer the upload path applies: key present AND enabled in
// Super Admin → Models, honouring an explicit pin. Lives here rather than beside
// the controller because `npm test` only globs src/services/**/__tests__.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCloner, publicModelName } from '../../../controllers/voiceClone.controller.js';

const BOTH = ['Google', 'ElevenLabs', 'Sarvam', 'Cartesia', 'FishAudio'];
const KEYS = ['FISH_API_KEY', 'ELEVENLABS_API_KEY', 'VOICE_CLONE_PROVIDER', 'FISH_TTS_MODEL'];
const saved = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.FISH_API_KEY = 'fish-key';
  process.env.ELEVENLABS_API_KEY = 'el-key';
  delete process.env.VOICE_CLONE_PROVIDER;
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('resolveCloner', () => {
  test('defaults to Fish Audio when both providers are usable', () => {
    assert.equal(resolveCloner({ enabledNames: BOTH }).id, 'fishaudio');
  });

  test('VOICE_CLONE_PROVIDER pins the choice', () => {
    process.env.VOICE_CLONE_PROVIDER = 'elevenlabs';
    assert.equal(resolveCloner({ enabledNames: BOTH }).id, 'elevenlabs');
  });

  test('an explicit request beats the env pin', () => {
    process.env.VOICE_CLONE_PROVIDER = 'elevenlabs';
    assert.equal(resolveCloner({ preferred: 'fishaudio', enabledNames: BOTH }).id, 'fishaudio');
  });

  test('a pin to a provider without a key falls through instead of failing', () => {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.VOICE_CLONE_PROVIDER = 'elevenlabs';
    assert.equal(resolveCloner({ enabledNames: BOTH }).id, 'fishaudio');
  });

  test('never clones to a provider Super Admin switched off', () => {
    // Same company serves both steps, so the clone would be unlistable AND mute.
    assert.equal(resolveCloner({ enabledNames: ['Google', 'ElevenLabs'] }).id, 'elevenlabs');
    assert.equal(resolveCloner({ enabledNames: ['Google', 'Sarvam'] }), null);
  });

  test('reports the model that will run at call time', () => {
    process.env.FISH_TTS_MODEL = 's2.1-pro';
    assert.equal(resolveCloner({ enabledNames: BOTH }).ttsModel(), 's2.1-pro');
  });

  test('the free-tier suffix is never shown, but is still what runs', () => {
    // fishaudio.provider.js picks its WebSocket model off the "-free" suffix,
    // so trimming it anywhere but the display layer would change synthesis.
    process.env.FISH_TTS_MODEL = 's2.1-pro-free';
    assert.equal(resolveCloner({ enabledNames: BOTH }).ttsModel(), 's2.1-pro-free');
    assert.equal(publicModelName('s2.1-pro-free'), 's2.1-pro');
  });

  test('publicModelName leaves everything else alone', () => {
    assert.equal(publicModelName('s2.1-pro'), 's2.1-pro');
    assert.equal(publicModelName('eleven_turbo_v2_5'), 'eleven_turbo_v2_5');
    // "free" only counts as the tier marker at the end, after a hyphen.
    assert.equal(publicModelName('free-tier-model'), 'free-tier-model');
    assert.equal(publicModelName(null), null);
  });

  test('no keys at all means sample-only, not a silent wrong provider', () => {
    delete process.env.FISH_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal(resolveCloner({ enabledNames: BOTH }), null);
  });
});
