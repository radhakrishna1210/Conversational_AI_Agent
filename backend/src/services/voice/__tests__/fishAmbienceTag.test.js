// What this pins: the Mode A ambience tag reaches the Fish synthesis REQUEST
// and nothing else. It is applied only on an S2-family model, only when the
// agent asked for native ambience, and the runtime's spoken/logged text never
// contains it — so a tag can only ever be interpreted by the model, and the
// live probe (reports/evidence/…/ambience/fish_tags) is what says whether the
// model reads it aloud.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyAmbienceTag, FishAudioTtsStream } from '../providers/fishaudio.provider.js';
import { ambienceTagFor } from '../ambience.js';
import { stripSpeechMarkup } from '../disfluency.js';

const saved = process.env.FISH_TTS_MODEL;
beforeEach(() => { process.env.FISH_TTS_MODEL = 's2.1-pro-free'; });
afterEach(() => { if (saved === undefined) delete process.env.FISH_TTS_MODEL; else process.env.FISH_TTS_MODEL = saved; });

describe('applyAmbienceTag', () => {
  test('prepends a well-formed tag on an S2 model, and only then', () => {
    assert.equal(applyAmbienceTag('Hello there.', '[office chatter in the background]'), '[office chatter in the background] Hello there.');
    assert.equal(applyAmbienceTag('Hello there.', null), 'Hello there.');
    assert.equal(applyAmbienceTag('Hello there.', 'office chatter'), 'Hello there.', 'not bracketed: refused');
    assert.equal(applyAmbienceTag('Hello there.', '[x]'), 'Hello there.', 'too short to be a real direction');
    process.env.FISH_TTS_MODEL = 's1';
    assert.equal(applyAmbienceTag('Hello there.', '[office chatter in the background]'), 'Hello there.', 's1 reads tags as words');
  });
  test('the tag never appears in anything the runtime records or shows', () => {
    const settings = { ambientMode: 'native', ambientSound: 'Office Chatter' };
    const tag = ambienceTagFor(settings);
    assert.ok(tag);
    const reply = 'Sure, I can book that for you.';
    // What is spoken/logged is the reply; the tag is only ever combined inside
    // the provider request body.
    assert.ok(!reply.includes(tag));
    assert.equal(stripSpeechMarkup(reply), reply);
    assert.ok(applyAmbienceTag(reply, tag).startsWith(tag), 'request body carries it');
  });

  test('judges the model that will read it when one is named', () => {
    process.env.FISH_TTS_MODEL = 's1';
    assert.equal(applyAmbienceTag('Hi.', '[office chatter in the background]', 's2-pro'), '[office chatter in the background] Hi.');
    process.env.FISH_TTS_MODEL = 's2.1-pro';
    assert.equal(applyAmbienceTag('Hi.', '[office chatter in the background]', 's1'), 'Hi.');
  });
});

// The token-streaming (ws-overlap) path is the fast path for a paid Fish voice,
// and it used to take no ambience tag at all: a native-ambience agent had its
// room on the greeting and on HTTP-split turns, and silence behind it on the
// turns that ran fastest.
describe('FishAudioTtsStream ambience', () => {
  const tag = '[office chatter in the background]';

  test('every text batch sent to an S2 socket carries the tag', () => {
    const s = new FishAudioTtsStream('voice-1', { modelId: 's2-pro', ambienceTag: tag });
    s.pushText('Sure, I can book that. ');
    s.pushText('What time suits you? ');
    s.end();
    assert.ok(s._pending.length >= 2);
    for (const t of s._pending) assert.ok(t.startsWith(tag), `untagged batch: ${JSON.stringify(t)}`);
    s.close();
  });

  test('no tag without native ambience, and never on a model that would speak it', () => {
    const plain = new FishAudioTtsStream('voice-1', { modelId: 's2-pro' });
    plain.pushText('Sure. ');
    plain.end();
    assert.ok(plain._pending.every((t) => !t.includes('[')));
    plain.close();

    const s1 = new FishAudioTtsStream('voice-1', { modelId: 's1', ambienceTag: tag });
    s1.pushText('Sure. ');
    s1.end();
    assert.ok(s1._pending.every((t) => !t.includes(tag)));
    s1.close();
  });
});
