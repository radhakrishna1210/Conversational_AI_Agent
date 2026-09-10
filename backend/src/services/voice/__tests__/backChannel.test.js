import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStandaloneBackChannel,
  detectBackChannel,
  normalizeBackChannelText,
} from '../backChannel.js';

test('backChannel', async (t) => {
  await t.test('detects standalone English back-channel tokens', () => {
    assert.equal(isStandaloneBackChannel('yeah'), true);
    assert.equal(isStandaloneBackChannel('Yeah!'), true);
    assert.equal(isStandaloneBackChannel('ok...'), true);
    assert.equal(isStandaloneBackChannel('uh-huh'), true);
    assert.equal(isStandaloneBackChannel('mm-hmm'), true);
    assert.equal(isStandaloneBackChannel('got it'), true);
    assert.equal(isStandaloneBackChannel('right'), true);
  });

  await t.test('detects standalone Hindi / Hinglish back-channel tokens', () => {
    assert.equal(isStandaloneBackChannel('हाँ'), true);
    assert.equal(isStandaloneBackChannel('जी हाँ'), true);
    assert.equal(isStandaloneBackChannel('ठीक है'), true);
    assert.equal(isStandaloneBackChannel('haan'), true);
    assert.equal(isStandaloneBackChannel('theek hai!'), true);
    assert.equal(isStandaloneBackChannel('sahi hai'), true);
  });

  await t.test('rejects substantive sentences containing words that look like back-channels', () => {
    assert.equal(isStandaloneBackChannel('Yeah I want to cancel my reservation'), false);
    assert.equal(isStandaloneBackChannel('Right now I am at home'), false);
    assert.equal(isStandaloneBackChannel('Can you help me?'), false);
  });

  await t.test('detectBackChannel separates prefix token from rest of utterance', () => {
    const res = detectBackChannel('Yeah, can you change my flight to tomorrow?');
    assert.equal(res.isBackChannel, true);
    assert.equal(res.token, 'yeah');
    assert.equal(res.isStandalone, false);
    assert.equal(res.rest, 'can you change my flight to tomorrow');
  });

  await t.test('empty and null inputs are safe', () => {
    assert.equal(isStandaloneBackChannel(''), false);
    assert.equal(isStandaloneBackChannel(null), false);
    assert.equal(isStandaloneBackChannel(undefined), false);
    assert.deepEqual(detectBackChannel(''), { isBackChannel: false, token: null, isStandalone: false, rest: '' });
  });
});
