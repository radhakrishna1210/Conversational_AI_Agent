// backend/src/services/voice/__tests__/fishTtsStream.test.js
/**
 * Protocol-shape tests for FishAudioTtsStream. The socket itself is not opened:
 * _raw is stubbed to capture frames, which is enough to pin the event sequence
 * and the sentence-boundary contract — the two things that have actually broken
 * before. Live behaviour is covered by scripts/probe-fish.js.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FishAudioTtsStream, canStreamTokens } from '../providers/fishaudio.provider.js';

/** Build a stream with a captured frame log, as if the socket were open. */
function openStream(opts = {}) {
  const stream = new FishAudioTtsStream('model-abc', opts);
  const frames = [];
  stream._raw = (obj) => frames.push(obj);
  stream._open = true;          // pretend the handshake completed
  stream._encode = (o) => o;    // not exercised while _raw is stubbed
  return { stream, frames };
}

const textFrames = (frames) => frames.filter((f) => f.event === 'text').map((f) => f.text);

describe('FishAudioTtsStream', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.FISH_API_KEY = 'test-key'; });
  afterEach(() => { process.env = { ...saved }; });

  it('buffers sub-word deltas and emits whole sentences only', () => {
    const { stream, frames } = openStream();
    for (const d of ['Your appo', 'int', 'ment is ', 'confirmed', '.']) stream.pushText(d);
    assert.deepEqual(textFrames(frames), ['Your appointment is confirmed. ']);
  });

  it('emits nothing until a sentence completes', () => {
    const { stream, frames } = openStream();
    stream.pushText('Sure, I can');
    assert.equal(textFrames(frames).length, 0);
  });

  it('flushes after each sentence when FISH_WS_FLUSH is not disabled', () => {
    const { stream, frames } = openStream();
    stream.pushText('Hello there.');
    assert.deepEqual(frames.map((f) => f.event), ['text', 'flush']);
  });

  it('omits flush frames when FISH_WS_FLUSH=false', () => {
    process.env.FISH_WS_FLUSH = 'false';
    const { stream, frames } = openStream();
    stream.pushText('Hello there.');
    assert.deepEqual(frames.map((f) => f.event), ['text']);
  });

  it('speaks the unterminated tail on end(), then stops', () => {
    process.env.FISH_WS_FLUSH = 'false';
    const { stream, frames } = openStream();
    stream.pushText('One. And a tail with no period');
    stream.end();
    assert.deepEqual(textFrames(frames), ['One. ', 'And a tail with no period ']);
    assert.equal(frames[frames.length - 1].event, 'stop');
  });

  it('ignores text pushed after end()', () => {
    const { stream, frames } = openStream();
    stream.end();
    const before = frames.length;
    stream.pushText('Too late.');
    assert.equal(frames.length, before);
  });

  it('queues text sent before the socket opens', () => {
    const stream = new FishAudioTtsStream('model-abc');
    stream._raw = () => { throw new Error('must not send before open'); };
    stream._open = false;
    stream.pushText('Hello there.');
    assert.deepEqual(stream._pending, ['Hello there. ']);
  });

  it('strips markdown that would otherwise be read aloud', () => {
    process.env.FISH_WS_FLUSH = 'false';
    const { stream, frames } = openStream();
    stream.pushText('**Sure**, I _can_ help.');
    assert.deepEqual(textFrames(frames), ['Sure, I can help. ']);
  });

  it('emits done exactly once', () => {
    const { stream } = openStream();
    let done = 0;
    stream.on('done', () => { done += 1; });
    stream.close();
    stream.close();
    assert.equal(done, 1);
  });

  it('reports no token streaming without a key', () => {
    delete process.env.FISH_API_KEY;
    assert.equal(canStreamTokens(), false);
  });
});
