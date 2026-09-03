// backend/src/services/voice/__tests__/greetingAudio.test.js
/**
 * P2 — the phone greeting is cached across calls instead of re-synthesized on
 * every answer.
 *
 * The risk in this cache is not "does it store bytes". It is the key: the
 * acknowledgment clip in agentRuntime.service.js was once cached WITHOUT an
 * audio format, so an MP3 reached a G.711 carrier as if it were mu-law and every
 * reply opened with static. These tests pin that the format, the rate, the pace,
 * the voice and the text all participate in the key — and that a truncated
 * greeting can never be stored, because storing one turns a transient barge-in
 * into a permanent regression for that agent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getGreetingAudio,
  rememberGreetingAudio,
  greetingSynthesisOpts,
  _resetGreetingAudioCache,
} from '../greetingAudio.js';

const VOICE = { id: 'voice_a' };
const OTHER_VOICE = { id: 'voice_b' };
const ULAW = { kind: 'native', format: 'ulaw_8000' };
const PCM8 = { kind: 'pcm', format: 'pcm', rate: 8000 };
const PCM24 = { kind: 'pcm', format: 'pcm', rate: 24000 };

const store = (voice, text, opts, bytes = 'audio') =>
  rememberGreetingAudio(voice, text, opts, Buffer.from(bytes), 'audio/mulaw');

test.beforeEach(() => _resetGreetingAudioCache());

test('a stored greeting comes back for the same voice, text and format', () => {
  const opts = greetingSynthesisOpts(ULAW, {});
  store(VOICE, 'Hi, this is Purva.', opts);
  const hit = getGreetingAudio(VOICE, 'Hi, this is Purva.', opts);
  assert.equal(hit.buf.toString(), 'audio');
  assert.equal(hit.audioFormat, 'ulaw_8000');
});

test('a different FORMAT is a miss, not a wrong-format hit', () => {
  // This is the static-on-the-line bug. A hit here would hand mu-law bytes to a
  // bridge that is about to treat them as raw PCM.
  store(VOICE, 'Hello there.', greetingSynthesisOpts(ULAW, {}));
  assert.equal(getGreetingAudio(VOICE, 'Hello there.', greetingSynthesisOpts(PCM8, {})), null);
});

test('a different RATE is a miss — a format alone is not enough for raw PCM', () => {
  // Same format string, different audio: the bridge emits at its own rate
  // regardless, so a 24kHz clip served to an 8kHz bridge plays at the wrong speed.
  store(VOICE, 'Hello there.', greetingSynthesisOpts(PCM8, {}));
  assert.equal(getGreetingAudio(VOICE, 'Hello there.', greetingSynthesisOpts(PCM24, {})), null);
});

test('a different PACE is a miss — it changes the bytes', () => {
  store(VOICE, 'Hello there.', greetingSynthesisOpts(ULAW, { speakingRate: 1.05 }));
  assert.equal(
    getGreetingAudio(VOICE, 'Hello there.', greetingSynthesisOpts(ULAW, { speakingRate: 1.2 })),
    null,
  );
});

test('a different voice and a different greeting are both misses', () => {
  const opts = greetingSynthesisOpts(ULAW, {});
  store(VOICE, 'Hello there.', opts);
  assert.equal(getGreetingAudio(OTHER_VOICE, 'Hello there.', opts), null);
  assert.equal(getGreetingAudio(VOICE, 'Hello there!', opts), null);
});

test('editing the welcome message serves the new one, never the old', () => {
  // The text IS the key, which is why this cache needs no TTL: a changed
  // greeting cannot be served stale, it simply lands on a new entry.
  const opts = greetingSynthesisOpts(ULAW, {});
  store(VOICE, 'Old greeting.', opts, 'old');
  store(VOICE, 'New greeting.', opts, 'new');
  assert.equal(getGreetingAudio(VOICE, 'New greeting.', opts).buf.toString(), 'new');
  assert.equal(getGreetingAudio(VOICE, 'Old greeting.', opts).buf.toString(), 'old');
});

test('an empty buffer is not stored', () => {
  const opts = greetingSynthesisOpts(ULAW, {});
  rememberGreetingAudio(VOICE, 'Hello there.', opts, Buffer.alloc(0), 'audio/mulaw');
  assert.equal(getGreetingAudio(VOICE, 'Hello there.', opts), null);
});

test('an implausibly large buffer is refused rather than pinned', () => {
  const opts = greetingSynthesisOpts(ULAW, {});
  rememberGreetingAudio(VOICE, 'Hello there.', opts, Buffer.alloc(2_000_000), 'audio/mpeg');
  assert.equal(getGreetingAudio(VOICE, 'Hello there.', opts), null);
});

test('the cache is bounded, and evicts least-recently-USED rather than oldest', async () => {
  const { _resetGreetingAudioCache: reset } = await import('../greetingAudio.js');
  reset();
  const opts = greetingSynthesisOpts(ULAW, {});
  const LIMIT = 200; // MAX_ENTRIES

  store(VOICE, 'first', opts, 'first');
  for (let i = 0; i < LIMIT - 1; i++) store(VOICE, `filler ${i}`, opts);

  // Keep 'first' hot, then overflow by one. FIFO would drop 'first'; LRU must
  // drop the coldest filler instead — an agent called all day must not be
  // evicted by a run of one-off test dials.
  assert.ok(getGreetingAudio(VOICE, 'first', opts));
  store(VOICE, 'overflow', opts);

  assert.ok(getGreetingAudio(VOICE, 'first', opts), 'the recently used entry survived');
  assert.equal(getGreetingAudio(VOICE, 'filler 0', opts), null, 'the coldest entry was evicted');
});

test('greetingSynthesisOpts states a rate for PCM only', () => {
  // A native mu-law format already implies 8kHz. Filling the rate in there
  // would key two identical clips differently depending on the caller.
  assert.deepEqual(greetingSynthesisOpts(ULAW, {}), {
    pace: 1.05, audioFormat: 'ulaw_8000', sampleRate: null, ambienceTag: null,
  });
  assert.deepEqual(greetingSynthesisOpts(PCM8, { speakingRate: 0.9 }), {
    pace: 0.9, audioFormat: 'pcm', sampleRate: 8000, ambienceTag: null,
  });
  // No resolved format at all (a voice the bridge would refuse): nothing to key
  // on, and nothing is warmed.
  assert.deepEqual(greetingSynthesisOpts(null, {}), {
    pace: 1.05, audioFormat: null, sampleRate: null, ambienceTag: null,
  });
});
