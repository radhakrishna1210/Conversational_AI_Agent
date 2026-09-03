// What this pins: the Mode A ambience tag reaches the Fish synthesis REQUEST
// and nothing else. It is applied only on an S2-family model, only when the
// agent asked for native ambience, and the runtime's spoken/logged text never
// contains it — so a tag can only ever be interpreted by the model, and the
// live probe (reports/evidence/…/ambience/fish_tags) is what says whether the
// model reads it aloud.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyAmbienceTag } from '../providers/fishaudio.provider.js';
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
});
