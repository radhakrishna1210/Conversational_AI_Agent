// backend/src/ws/__tests__/callRecordingTap.test.js
//
// The tap's only real job is deciding WHEN each outbound frame is heard. Every
// bridge depends on it, and getting it wrong produces a recording that plays
// fine and misrepresents the call — the agent's whole reply crammed into the
// moment it was generated, followed by silence. So these assert the offsets
// handed to the recorder, with a frozen clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { createRecordingTap } = await import('../callRecordingTap.js');

const RATE = 8000;
/** 160 mu-law bytes = 20ms, the carrier frame size. */
const frame = (ms = 20) => Buffer.alloc(Math.round((ms / 1000) * RATE), 0x7f);

/** Recorder stand-in that just records what it was asked to place, and where. */
const spyRecorder = () => {
  const inbound = [];
  const outbound = [];
  return {
    inbound,
    outbound,
    writeInbound: (buf, at) => inbound.push({ bytes: buf.length, at }),
    writeOutbound: (buf, at) => outbound.push({ bytes: buf.length, at }),
    dropOutboundAfter: (at) => outbound.push({ dropAfter: at }),
    hasAudio: true,
    wasCapped: false,
    discard() {},
    toWav: () => null,
  };
};

/** Tap wired to a frozen, manually advanced clock. */
const harness = (startedAt = 1_000_000) => {
  let t = startedAt;
  const rec = spyRecorder();
  const tap = createRecordingTap({
    label: 'test',
    startedAt,
    now: () => t,
    createRecorder: () => rec,
  });
  return { tap, rec, advance: (ms) => { t += ms; }, at: () => t };
};

test('inbound frames are placed at arrival time', () => {
  const { tap, rec, advance } = harness();
  tap.inbound(frame());
  advance(20);
  tap.inbound(frame());
  advance(1000);
  tap.inbound(frame());

  assert.deepEqual(rec.inbound.map((w) => w.at), [0, 20, 1020]);
});

test('a burst of outbound frames is spread across playout time, not stacked', () => {
  // The real shape of the bug: an engine hands over 20 frames (400ms of audio)
  // in a few milliseconds of wall clock.
  const { tap, rec } = harness();
  for (let i = 0; i < 20; i++) tap.outbound(frame(20));

  const offsets = rec.outbound.map((w) => w.at);
  assert.deepEqual(offsets, Array.from({ length: 20 }, (_, i) => i * 20));
  // 20 frames x 20ms must occupy 400ms of the recording, not ~0ms.
  assert.equal(offsets.at(-1) + 20, 400);
});

test('frame duration follows byte length, not a fixed frame size', () => {
  // Bundled engines emit arbitrary chunk lengths; assuming 20ms each would
  // desynchronise the agent leg progressively over a call.
  const { tap, rec } = harness();
  tap.outbound(frame(100));
  tap.outbound(frame(50));
  tap.outbound(frame(20));

  assert.deepEqual(rec.outbound.map((w) => w.at), [0, 100, 150]);
});

test('the playhead restarts from now after the carrier has drained', () => {
  const { tap, rec, advance } = harness();
  tap.outbound(frame(100));   // buffered 0-100ms
  advance(5000);              // long silence; carrier drained long ago
  tap.outbound(frame(20));

  // Must be placed at 5000ms, not appended at 100ms — otherwise every gap in
  // the conversation would be squeezed out of the recording.
  assert.deepEqual(rec.outbound.map((w) => w.at), [0, 5000]);
});

test('outbound audio still buffered is not restarted from now', () => {
  const { tap, rec, advance } = harness();
  tap.outbound(frame(1000));  // 1s buffered at the carrier
  advance(100);               // only 100ms has actually elapsed
  tap.outbound(frame(20));

  // The second frame plays after the first finishes, at 1000ms — not at 100ms,
  // which would overlap the agent with itself.
  assert.deepEqual(rec.outbound.map((w) => w.at), [0, 1000]);
});

test('barge drops buffered audio at the moment of interruption', () => {
  const { tap, rec, advance } = harness();
  tap.outbound(frame(2000));  // a 2s reply, shipped instantly
  advance(300);               // caller cuts in 300ms into playback
  tap.barge();

  assert.deepEqual(rec.outbound.at(-1), { dropAfter: 300 });
});

test('audio after a barge is placed from the interruption, not the old playhead', () => {
  const { tap, rec, advance } = harness();
  tap.outbound(frame(2000));
  advance(300);
  tap.barge();
  advance(200);
  tap.outbound(frame(20));    // the agent's next reply

  // 500ms — where it is actually heard. Without resetting the playhead on
  // barge it would land at 2000ms, leaving a false 1.5s silence.
  assert.equal(rec.outbound.at(-1).at, 500);
});

test('empty and missing frames are ignored', () => {
  const { tap, rec } = harness();
  tap.inbound(Buffer.alloc(0));
  tap.inbound(null);
  tap.outbound(Buffer.alloc(0));
  tap.outbound(undefined);

  assert.equal(rec.inbound.length, 0);
  assert.equal(rec.outbound.length, 0);
});

test('save is guarded, because bridge cleanup runs more than once', () => {
  let renders = 0;
  const rec = { ...spyRecorder(), toWav: () => { renders += 1; return null; } };
  const tap = createRecordingTap({
    label: 'test', startedAt: 0, now: () => 0, createRecorder: () => rec,
  });

  tap.save('call-1');
  tap.save('call-1');

  // toWav runs on a setImmediate, so let the queue drain before asserting.
  return new Promise((resolve) => setImmediate(() => setImmediate(() => {
    assert.equal(renders, 1, 'a second cleanup must not write the call twice');
    resolve();
  })));
});

test('a call with no log id renders nothing', () => {
  let renders = 0;
  const rec = { ...spyRecorder(), toWav: () => { renders += 1; return null; } };
  const tap = createRecordingTap({
    label: 'test', startedAt: 0, now: () => 0, createRecorder: () => rec,
  });

  tap.save(null);

  return new Promise((resolve) => setImmediate(() => setImmediate(() => {
    assert.equal(renders, 0);
    resolve();
  })));
});

test('PHONE_RECORDING=off makes the tap inert', () => {
  const prev = process.env.PHONE_RECORDING;
  process.env.PHONE_RECORDING = 'off';
  try {
    let built = false;
    const tap = createRecordingTap({
      label: 'test', startedAt: 0, createRecorder: () => { built = true; return spyRecorder(); },
    });
    assert.equal(tap.active, false);
    assert.equal(built, false, 'no recorder should be allocated when disabled');
    // Must stay callable — the bridges do not branch on `active`.
    tap.inbound(frame());
    tap.outbound(frame());
    tap.barge();
    tap.save('call-1');
  } finally {
    if (prev === undefined) delete process.env.PHONE_RECORDING;
    else process.env.PHONE_RECORDING = prev;
  }
});
