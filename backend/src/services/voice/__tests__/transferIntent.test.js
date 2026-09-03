// What these pin: a caller who asks for a human is recognised in English,
// Hindi and code-switched Hinglish; a caller who says the words while meaning
// the opposite is NOT; and the model's structured signal is stripped from
// speech in every fragmentation the token stream can produce.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTransferRequest, stripTransferMarker, createTransferMarkerScanner, transferPromptSection, TRANSFER_MARKER,
} from '../transferIntent.js';

const yes = (t) => { const r = detectTransferRequest(t); assert.equal(r.requested, true, `${JSON.stringify(t)} → ${JSON.stringify(r)}`); assert.equal(r.confidence, 'high'); };
const no = (t) => { const r = detectTransferRequest(t); assert.equal(r.requested, false, `${JSON.stringify(t)} → ${JSON.stringify(r)}`); };

describe('detectTransferRequest — positive phrasings', () => {
  test('English', () => {
    for (const t of [
      'Transfer the call.',
      'Can I speak to a real person please?',
      'I want to talk to a person.',
      'Get me your manager.',
      'Connect me to your supervisor.',
      'Let me talk to someone real.',
      'Put me through to an agent.',
      'Is there a human I can talk to?',
      'You are a bot, I want a human.',
      'Operator please.',
      'Could you transfer me to customer care?',
    ]) yes(t);
  });
  test('Hindi and Hinglish', () => {
    for (const t of [
      'मुझे इंसान से बात करनी है',
      'किसी इंसान से बात कराओ',
      'मैनेजर से बात कराओ',
      'कॉल ट्रांसफर करो',
      'Mujhe manager se baat karni hai',
      'Kisi insaan se baat karao please',
      'Call transfer kar do',
      'Agent se connect karo',
      'yaar kisi se baat karao, mujhe aapki samajh nahi aa rahi',
    ]) yes(t);
  });
});

describe('detectTransferRequest — negatives', () => {
  test('negated or reported speech does not fire', () => {
    for (const t of [
      'No, I don\'t need a manager, just tell me the price.',
      'I do not want to talk to a person, you are fine.',
      'My manager told me to call and book an appointment.',
      'The receptionist said the clinic opens at nine.',
      'Nahi, manager se baat nahi karni.',
      'मुझे मैनेजर से बात नहीं करनी',
      'Someone said you have a discount, is that true?',
    ]) no(t);
  });
  test('ordinary turns do not fire; a lone human-word is only a medium hint', () => {
    no('What are your business hours on weekends?');
    no('Okay, can you book me an appointment for tomorrow morning at ten?');
    const r = detectTransferRequest('Is the manager in today?');
    assert.equal(r.requested, false);
    assert.equal(r.confidence, 'medium');
    assert.deepEqual(detectTransferRequest(''), { requested: false, confidence: null, matched: null, negated: false });
  });
});

describe('marker handling', () => {
  test('stripTransferMarker removes every variant and reports it', () => {
    assert.deepEqual(stripTransferMarker(`${TRANSFER_MARKER} Sure, connecting you now.`), { text: 'Sure, connecting you now.', transfer: true });
    assert.deepEqual(stripTransferMarker('Sure. [[ transfer ]] One moment.'), { text: 'Sure.  One moment.', transfer: true });
    assert.deepEqual(stripTransferMarker('Our hours are 9 to 6.'), { text: 'Our hours are 9 to 6.', transfer: false });
  });

  test('the streaming scanner strips a fragmented leading marker and never speaks any of it', () => {
    const s = createTransferMarkerScanner();
    const out = [s.push('[['), s.push('TRANS'), s.push('FER]]'), s.push(' Sure, one'), s.push(' moment.'), s.flush()].join('');
    assert.equal(out, 'Sure, one moment.');
    assert.equal(s.found(), true);
  });

  test('a reply that merely starts with a bracket is released once it cannot be the marker', () => {
    const s = createTransferMarkerScanner();
    const out = [s.push('['), s.push('note] We open'), s.push(' at 9.'), s.flush()].join('');
    assert.equal(out, '[note] We open at 9.');
    assert.equal(s.found(), false);
  });

  test('ordinary replies pass through unchanged; a mid-reply marker is still caught', () => {
    const s = createTransferMarkerScanner();
    assert.equal([s.push('We are open '), s.push('9 to 6.'), s.flush()].join(''), 'We are open 9 to 6.');
    assert.equal(s.found(), false);
    const s2 = createTransferMarkerScanner();
    const out = [s2.push('Of course. '), s2.push(`${TRANSFER_MARKER} Connecting you.`), s2.flush()].join('');
    assert.equal(out, 'Of course. Connecting you.');
    assert.equal(s2.found(), true);
  });

  test('flush releases a short reply that was being held', () => {
    const s = createTransferMarkerScanner();
    assert.equal(s.push('[['), '');
    assert.equal(s.flush(), '[[');
  });
});

describe('transferPromptSection', () => {
  test('available: teaches the marker and forbids pretending', () => {
    const p = transferPromptSection({ available: true, condition: 'the caller asks about refunds' });
    assert.ok(p.includes(TRANSFER_MARKER));
    assert.ok(/refunds/.test(p));
    assert.ok(/Never say a transfer already happened/.test(p));
  });
  test('unavailable: honest refusal with a callback offer, no marker', () => {
    const p = transferPromptSection({ available: false });
    assert.ok(!p.includes(TRANSFER_MARKER));
    assert.ok(/cannot connect them to a person/.test(p));
    assert.ok(/call them back/.test(p));
  });
});
