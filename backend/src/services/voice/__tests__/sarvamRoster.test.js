// backend/src/services/voice/__tests__/sarvamRoster.test.js
/**
 * Sarvam speaker discovery. `fetch` is stubbed with the API's real 400 bodies,
 * because the whole mechanism is error-message parsing: Sarvam publishes no
 * list-speakers endpoint, so the two rejection messages ARE the catalogue.
 * The intersection rule is the load-bearing part — each list on its own names
 * speakers that fail on a real call.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getVoices, searchVoices, getVoiceById, resetSpeakerCache } from '../providers/sarvam.provider.js';

const realFetch = globalThis.fetch;

const UNION = 'anushka, abhilash, hitesh, aditya, ritu, kavya, shubh';
const V3 = 'aditya, ritu, kavya, shubh, niharika';

/** Answer each probe the way the live API does. */
function stubSarvam({ unionBody, compatBody } = {}) {
  const seen = [];
  globalThis.fetch = async (_url, init) => {
    const { speaker, model } = JSON.parse(init.body);
    seen.push(speaker);
    const reject = (message) => ({
      ok: false, status: 400, text: async () => JSON.stringify({ error: { message } }),
    });
    if (speaker === '__roster_probe__') {
      return reject(unionBody ?? `Speaker '${speaker}' is not recognized. Available speakers are: ${UNION}`);
    }
    if (['anushka', 'abhilash', 'hitesh'].includes(speaker)) {
      return reject(compatBody
        ?? `Speaker '${speaker}' is not compatible with model ${model}. Available speakers for ${model} are: ${V3}`);
    }
    return { ok: true, status: 200, json: async () => ({ audios: ['AAA='] }), text: async () => '' };
  };
  return seen;
}

describe('Sarvam speaker roster', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SARVAM_API_KEY = 'test-key';
    delete process.env.SARVAM_TTS_MODEL;
    resetSpeakerCache();       // the roster is cached for an hour in normal use
  });
  afterEach(() => { process.env = { ...saved }; globalThis.fetch = realFetch; });

  it('offers only speakers that appear in BOTH lists', async () => {
    stubSarvam();
    const names = (await getVoices()).map((v) => v.providerVoiceId);
    // anushka/abhilash/hitesh: recognized, but this model refuses them.
    // niharika: in the model list, but synthesis does not recognize it.
    assert.deepEqual(names, ['aditya', 'ritu', 'kavya', 'shubh']);
  });

  it('caches the roster so the picker does not re-probe on every call', async () => {
    const seen = stubSarvam();
    await getVoices();
    const afterFirst = seen.length;
    await getVoices();
    assert.equal(seen.length, afterFirst, 'no second round of probes');
  });

  it('falls back to the last known roster when neither list can be parsed', async () => {
    stubSarvam({ unionBody: 'something else entirely', compatBody: 'also unhelpful' });
    const names = (await getVoices()).map((v) => v.providerVoiceId);
    assert.ok(names.length > 30, 'a populated picker beats an empty one');
    assert.ok(names.includes('shubh'));
  });

  it('searches the roster by name and imports case-insensitively', async () => {
    stubSarvam();
    assert.deepEqual((await searchVoices('rit')).map((v) => v.name), ['ritu']);
    assert.deepEqual(await searchVoices('  '), []);
    assert.equal((await getVoiceById('RITU'))?.providerVoiceId, 'ritu', 'stored under Sarvam\u2019s spelling');
    assert.equal(await getVoiceById('anushka'), null, 'an incompatible speaker cannot be imported');
  });

  it('keeps curated metadata and leaves the rest unguessed', async () => {
    stubSarvam();
    const voices = await getVoices();
    const shubh = voices.find((v) => v.providerVoiceId === 'shubh');
    const kavya = voices.find((v) => v.providerVoiceId === 'kavya');
    assert.equal(shubh.gender, 'male');
    assert.equal(shubh.language, 'Hindi');
    assert.equal(kavya.gender, null, 'no gender is better than a guessed one');
  });
});
