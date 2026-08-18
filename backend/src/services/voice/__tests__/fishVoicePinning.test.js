// backend/src/services/voice/__tests__/fishVoicePinning.test.js
/**
 * getVoices() catalogue selection. `fetch` is stubbed per URL so the tests pin
 * WHICH calls go out — that is the actual contract here: a curated
 * FISH_VOICE_IDS must replace the public library sweep rather than be buried in
 * it, and a pinned voice must survive a failed metadata lookup.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getVoices, searchVoices, getVoiceById, streamVoice } from '../providers/fishaudio.provider.js';

const realFetch = globalThis.fetch;
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

/** Record every requested URL and answer from a { matcher: response } table. */
function stubFetch(routes) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    for (const [needle, res] of routes) {
      if (String(url).includes(needle)) return typeof res === 'function' ? res() : res;
    }
    return ok({ items: [] });
  };
  return urls;
}

describe('Fish Audio voice catalogue', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.FISH_API_KEY = 'test-key';
    delete process.env.FISH_VOICE_IDS;
    process.env.FISH_VOICE_LANGUAGES = 'en,hi';
  });
  afterEach(() => { process.env = { ...saved }; globalThis.fetch = realFetch; });

  it('sweeps the public library per language when nothing is pinned', async () => {
    const urls = stubFetch([]);
    await getVoices();
    assert.ok(urls.some((u) => u.includes('self=true')), 'own models are always pulled');
    assert.ok(urls.some((u) => u.includes('language=en')), 'English is swept');
    assert.ok(urls.some((u) => u.includes('language=hi')), 'Hindi is swept');
  });

  it('pages through the library until FISH_VOICE_LIMIT is met', async () => {
    process.env.FISH_VOICE_LIMIT = '600';        // 300 per language → 3 pages each
    process.env.FISH_VOICE_LANGUAGES = 'en,hi';
    let n = 0;
    const page = (lang) => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        items: Array.from({ length: 100 }, () => ({ _id: `${lang}-${n++}`, title: 'V', languages: [lang] })),
        has_more: true,
      }),
    });
    const urls = stubFetch([
      ['language=en', () => page('en')],
      ['language=hi', () => page('hi')],
    ]);

    const voices = await getVoices();
    const pages = (lang) => urls.filter((u) => u.includes(`language=${lang}`));
    assert.equal(pages('en').length, 3, 'three pages of 100 for English');
    assert.equal(pages('hi').length, 3, 'three pages of 100 for Hindi');
    assert.ok(pages('en').some((u) => u.includes('page_number=3')), 'page_number advances');
    assert.equal(voices.length, 600);
  });

  it('stops paging as soon as the API says there is no more', async () => {
    process.env.FISH_VOICE_LIMIT = '600';
    const urls = stubFetch([['visibility=public', () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ items: [{ _id: 'only-one', title: 'V', languages: ['en'] }], has_more: false }),
    })]]);

    await getVoices();
    assert.equal(urls.filter((u) => u.includes('language=en')).length, 1, 'no page 2 after has_more=false');
  });

  it('serves ONLY the pinned voices plus own models when FISH_VOICE_IDS is set', async () => {
    process.env.FISH_VOICE_IDS = 'abc123,def456';
    const urls = stubFetch([
      ['/model/abc123', ok({ _id: 'abc123', title: 'Aarav', languages: ['hi'], visibility: 'public' })],
      ['/model/def456', ok({ _id: 'def456', title: 'Meera', languages: ['en'], visibility: 'public' })],
    ]);

    const voices = await getVoices();

    assert.equal(urls.filter((u) => u.includes('visibility=public')).length, 0,
      'the public sweep is skipped for a curated list');
    assert.ok(urls.some((u) => u.includes('self=true')), 'own models and clones still sync');
    assert.deepEqual(voices.map((v) => v.providerVoiceId), ['abc123', 'def456']);
    assert.deepEqual(voices.map((v) => v.name), ['Aarav', 'Meera']);
  });

  it('lets the typed label and language override what the API reports', async () => {
    process.env.FISH_VOICE_IDS = 'abc123:Front Desk:hi:female';
    stubFetch([['/model/abc123', ok({ _id: 'abc123', title: 'Some Library Name', languages: ['es'] })]]);

    const [voice] = await getVoices();
    assert.equal(voice.name, 'Front Desk');
    assert.equal(voice.language, 'Hindi');
    assert.equal(voice.gender, 'female');
  });

  it('keeps a pinned voice whose metadata lookup fails', async () => {
    process.env.FISH_VOICE_IDS = 'abc123:Front Desk:hi';
    stubFetch([['/model/abc123', { ok: false, status: 404, text: async () => 'nope', json: async () => ({}) }]]);

    const voices = await getVoices();
    assert.deepEqual(voices.map((v) => v.providerVoiceId), ['abc123']);
    assert.equal(voices[0].name, 'Front Desk');
  });

  it('still throws when every call fails and nothing is pinned', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };
    await assert.rejects(getVoices(), /network down/);
  });
});

describe('Fish Audio library search', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.FISH_API_KEY = 'test-key'; process.env.FISH_VOICE_LANGUAGES = 'en,hi'; });
  afterEach(() => { process.env = { ...saved }; globalThis.fetch = realFetch; });

  it('queries by title and normalises the hits', async () => {
    const urls = stubFetch([['title=Bunty', ok({
      items: [
        { _id: 'v1', title: 'Bunty', languages: ['hi', 'en'], visibility: 'public' },
        { _id: 'v2', title: 'Bunty punchy', languages: ['en'], visibility: 'public' },
      ],
    })]]);

    const hits = await searchVoices('Bunty', { limit: 10 });
    assert.ok(urls[0].includes('title=Bunty'), 'searches by title');
    assert.ok(urls[0].includes('page_size=10'));
    assert.deepEqual(hits.map((h) => h.providerVoiceId), ['v1', 'v2']);
    assert.equal(hits[0].language, 'Hindi', 'own primary language wins');
  });

  it('does not call the API for an empty query', async () => {
    const urls = stubFetch([]);
    assert.deepEqual(await searchVoices('   '), []);
    assert.equal(urls.length, 0);
  });

  it('returns null rather than throwing when an id is not in the library', async () => {
    stubFetch([['/model/nope', { ok: false, status: 404, text: async () => '', json: async () => ({}) }]]);
    assert.equal(await getVoiceById('nope'), null);
  });
});

describe('Fish Audio telephony output', () => {
  const saved = { ...process.env };
  let sent;
  beforeEach(() => {
    process.env.FISH_API_KEY = 'test-key';
    delete process.env.FISH_TTS_FORMAT;
    sent = [];
    globalThis.fetch = async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return {
        ok: true, status: 200,
        headers: { get: () => 'application/octet-stream' },
        body: (async function* () { yield Buffer.alloc(4); })(),
      };
    };
  });
  afterEach(() => { process.env = { ...saved }; globalThis.fetch = realFetch; });

  it('asks for raw PCM at the carrier rate when the bridge requests it', async () => {
    const { contentType } = await streamVoice('v1', 'hello', {
      fast: true, audioFormat: 'pcm', sampleRate: 8000,
    });
    assert.equal(sent[0].format, 'pcm');
    assert.equal(sent[0].sample_rate, 8000, 'the line rate must survive to the API');
    // Fish answers a PCM request with application/octet-stream; trusting that
    // header would make the bridge treat 8kHz PCM as MP3.
    assert.equal(contentType, 'audio/l16');
  });

  it('still defaults to MP3 when no format is requested', async () => {
    await streamVoice('v1', 'hello', { fast: true });
    assert.equal(sent[0].format, 'mp3');
    assert.equal(sent[0].sample_rate, 32000, 'mp3 rejects 8000 — the default must not follow it');
  });

  it('honours an explicit rate only for raw PCM', async () => {
    await streamVoice('v1', 'hello', { fast: true, audioFormat: 'mp3', sampleRate: 8000 });
    assert.equal(sent[0].sample_rate, 32000, 'Fish 400s on mp3 at 8000');
  });
});
