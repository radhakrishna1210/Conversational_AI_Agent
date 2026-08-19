// The PIOPIY media socket's INBOUND envelope.
//
// Worth testing in isolation for a reason the other carriers do not share:
// PIOPIY publishes the send side of this socket (its SDK builds the frame) but
// nothing that states what it pushes back down. So readInboundAudio accepts
// several shapes on purpose, and these tests pin what "several" means — the
// failure mode of getting it wrong is a call that connects, bills, and hears
// nothing, with no error anywhere.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readInboundAudio } from '../piopiyMediaRealtime.handler.js';

const AUDIO = Buffer.from([0x00, 0x01, 0xff, 0x7f]);
const B64 = AUDIO.toString('base64');
const json = (o) => Buffer.from(JSON.stringify(o));

describe('piopiy inbound audio — envelopes that carry audio', () => {
  test('binary frames are the audio, with no envelope to misread', () => {
    const { pcm, envelope } = readInboundAudio(AUDIO, true);
    assert.deepEqual(pcm, AUDIO);
    assert.equal(envelope, null);
  });

  test('reads data.audioData — the mirror of the frame we send', () => {
    const { pcm } = readInboundAudio(
      json({ type: 'streamAudio', data: { audioDataType: 'raw', sampleRate: 8000, audioData: B64 } }),
      false,
    );
    assert.deepEqual(pcm, AUDIO);
  });

  test('reads a top-level audioData', () => {
    assert.deepEqual(readInboundAudio(json({ audioData: B64 }), false).pcm, AUDIO);
  });

  test('reads media.payload, the shape every other carrier here uses', () => {
    assert.deepEqual(readInboundAudio(json({ event: 'media', media: { payload: B64 } }), false).pcm, AUDIO);
  });

  test('reads media.audioData', () => {
    assert.deepEqual(readInboundAudio(json({ media: { audioData: B64 } }), false).pcm, AUDIO);
  });

  test('reads a string payload or a string data field', () => {
    assert.deepEqual(readInboundAudio(json({ payload: B64 }), false).pcm, AUDIO);
    assert.deepEqual(readInboundAudio(json({ data: B64 }), false).pcm, AUDIO);
  });
});

describe('piopiy inbound audio — frames that carry none', () => {
  test('a control message yields no audio but keeps its envelope for the log', () => {
    const { pcm, envelope } = readInboundAudio(json({ action: 'stop' }), false);
    assert.equal(pcm, null);
    // The envelope is what the first-frame log line reports, and it is the only
    // way an operator learns the real shape. Losing it would leave a silent
    // call with nothing to diagnose it from.
    assert.deepEqual(envelope, { action: 'stop' });
  });

  test('an object data field is not mistaken for base64', () => {
    // `data` holding the documented streamAudio object must not be stringified
    // into garbage audio; only a STRING data field is treated as a payload.
    const { pcm } = readInboundAudio(json({ data: { sampleRate: 8000 } }), false);
    assert.equal(pcm, null);
  });

  test('non-JSON text is ignored rather than throwing mid-call', () => {
    const { pcm, envelope } = readInboundAudio(Buffer.from('pong'), false);
    assert.equal(pcm, null);
    assert.equal(envelope, null);
  });

  test('an empty audioData is treated as no audio, not an empty buffer', () => {
    assert.equal(readInboundAudio(json({ audioData: '' }), false).pcm, null);
  });
});
