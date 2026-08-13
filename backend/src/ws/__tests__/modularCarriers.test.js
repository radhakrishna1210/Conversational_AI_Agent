// The carrier envelopes for the shared modular bridge.
//
// Worth testing in isolation because every difference between them is a SILENT
// failure on a live call: wrong event name and the agent's audio is discarded
// by the carrier with no error, wrong flush and barge-in stops working, wrong
// id field and nothing is ever sent at all.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { twilioCarrier } from '../twilioMediaModular.handler.js';
import { plivoCarrier } from '../plivoMediaModular.handler.js';
import { STREAM_CONTENT_TYPE, STREAM_SAMPLE_RATE } from '../../services/telephony/plivo.provider.js';

/** Minimal stand-in for a ws socket that records what was written. */
const fakeWs = () => {
  const sent = [];
  return { sent, send: (s) => sent.push(JSON.parse(s)) };
};

const FRAME = Buffer.from([0xff, 0x7f, 0x00, 0x80]);

describe('twilio carrier envelope', () => {
  test('reads the stream id and the call log id from start', () => {
    const got = twilioCarrier.readStart({
      event: 'start',
      start: { streamSid: 'MZ123', customParameters: { callLogId: 'log_1' } },
    });
    assert.equal(got.streamId, 'MZ123');
    assert.equal(got.callLogId, 'log_1');
  });

  test('sends audio as a media event keyed by streamSid', () => {
    const ws = fakeWs();
    twilioCarrier.sendAudio(ws, 'MZ123', FRAME);
    assert.deepEqual(ws.sent[0], {
      event: 'media',
      streamSid: 'MZ123',
      media: { payload: FRAME.toString('base64') },
    });
  });

  test('flushes with clear', () => {
    const ws = fakeWs();
    twilioCarrier.clearAudio(ws, 'MZ123');
    assert.deepEqual(ws.sent[0], { event: 'clear', streamSid: 'MZ123' });
  });
});

describe('plivo carrier envelope', () => {
  test('reads streamId — not streamSid, which Plivo never sends', () => {
    const got = plivoCarrier.readStart({
      event: 'start',
      start: { streamId: 'b77e037d', callId: '8c43a765', tracks: ['inbound'] },
    });
    assert.equal(got.streamId, 'b77e037d');
  });

  // Plivo has no equivalent of Twilio's customParameters. Returning a callLogId
  // here would overwrite the one the upgrade handler read off the socket URL,
  // and the call would never be settled against its log.
  test('returns no callLogId, leaving the socket-URL one in place', () => {
    const got = plivoCarrier.readStart({ event: 'start', start: { streamId: 'x' } });
    assert.equal(got.callLogId, null);
  });

  test('sends audio as playAudio with the format on every frame', () => {
    const ws = fakeWs();
    plivoCarrier.sendAudio(ws, 'b77e037d', FRAME);
    assert.deepEqual(ws.sent[0], {
      event: 'playAudio',
      media: {
        contentType: STREAM_CONTENT_TYPE,
        sampleRate: STREAM_SAMPLE_RATE,
        payload: FRAME.toString('base64'),
      },
    });
  });

  // The socket was opened by a <Stream contentType="…"> built from these same
  // two constants. If they ever diverge the audio is garbled, not rejected.
  test('the declared format matches the Stream element constants', () => {
    const ws = fakeWs();
    plivoCarrier.sendAudio(ws, 's', FRAME);
    assert.equal(ws.sent[0].media.contentType, 'audio/x-mulaw');
    assert.equal(ws.sent[0].media.sampleRate, 8000);
  });

  test('flushes with clearAudio keyed by streamId', () => {
    const ws = fakeWs();
    plivoCarrier.clearAudio(ws, 'b77e037d');
    assert.deepEqual(ws.sent[0], { event: 'clearAudio', streamId: 'b77e037d' });
  });
});

describe('the two envelopes really are different', () => {
  // A regression guard with a purpose: the Plivo bridge began as a copy of the
  // Twilio one, and the failure mode of an incomplete copy is a call that
  // connects, bills, and plays nothing.
  test('audio events do not share an event name', () => {
    const a = fakeWs(); const b = fakeWs();
    twilioCarrier.sendAudio(a, 's', FRAME);
    plivoCarrier.sendAudio(b, 's', FRAME);
    assert.notEqual(a.sent[0].event, b.sent[0].event);
  });

  test('flush events do not share an event name', () => {
    const a = fakeWs(); const b = fakeWs();
    twilioCarrier.clearAudio(a, 's');
    plivoCarrier.clearAudio(b, 's');
    assert.notEqual(a.sent[0].event, b.sent[0].event);
  });
});
