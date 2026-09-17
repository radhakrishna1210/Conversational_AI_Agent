// What these pin: the client's voice picker. One list, names only — so which
// voices are in it (can they speak the agent's language?), what each is called
// (Google names are locale ids), and the order (mixed across providers, but the
// same every time) all have to be right on the server.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPickerList,
  parseAgentLanguage,
  voiceDisplayName,
  voiceNameFromLabel,
  voiceServesLanguage,
  voiceCategoryLabel,
} from '../voicePicker.js';

const v = (id, provider, name, language = null, accent = null, metadata = null) => ({
  id, name, language, accent, metadata, provider: { name: provider },
});

describe('names', () => {
  test('Google locale ids become the voice name', () => {
    assert.equal(voiceDisplayName('en-IN-Chirp3-HD-Despina', 'Google'), 'Despina');
    assert.equal(voiceDisplayName('hi-IN-Wavenet-A', 'Google'), 'Wavenet A');
  });

  test('other names are tidied, not rewritten', () => {
    assert.equal(voiceDisplayName('ritu', 'Sarvam'), 'Ritu');
    assert.equal(voiceDisplayName('Aoede (female)'), 'Aoede');
    assert.equal(voiceDisplayName('en-US-looking-title', 'FishAudio'), 'En-US-looking-title');
    assert.equal(voiceDisplayName('', 'Sarvam'), 'Voice');
  });

  test('a stored label loses its provider', () => {
    assert.equal(voiceNameFromLabel('Sarvam - ritu'), 'Ritu');
    assert.equal(voiceNameFromLabel('Google - en-IN-Chirp3-HD-Despina'), 'Despina');
    assert.equal(voiceNameFromLabel('Google - Aoede (female)'), 'Aoede');
    // A voice name that itself contains " - " survives.
    assert.equal(voiceNameFromLabel('FishAudio - Calm Narrator - Hindi'), 'Calm Narrator - Hindi');
    assert.equal(voiceNameFromLabel(''), '');
    assert.equal(voiceNameFromLabel(null), '');
  });
});

describe('language', () => {
  test('agent labels split into language and accent', () => {
    assert.deepEqual(parseAgentLanguage('English (Indian)'), { language: 'English', accent: 'Indian' });
    assert.deepEqual(parseAgentLanguage('Hindi'), { language: 'Hindi', accent: null });
  });

  test('a Sarvam speaker serves every Indian language whatever its tag', () => {
    const aditya = v('1', 'Sarvam', 'aditya', 'English', 'Indian');
    assert.equal(voiceServesLanguage(aditya, 'Hindi'), true);
    assert.equal(voiceServesLanguage(aditya, 'Tamil'), true);
    assert.equal(voiceServesLanguage(aditya, 'Spanish'), false);
  });

  test('ElevenLabs voices are multilingual; Google voices are bound to their locale', () => {
    assert.equal(voiceServesLanguage(v('2', 'ElevenLabs', 'Rachel', 'English'), 'Hindi'), true);
    assert.equal(voiceServesLanguage(v('3', 'Google', 'en-US-Chirp3-HD-Aoede', 'English'), 'Hindi'), false);
    assert.equal(voiceServesLanguage(v('4', 'Google', 'hi-IN-Chirp3-HD-Aoede', 'Hindi'), 'Hindi'), true);
  });

  test('Fish voices match any language they were published with; codes are normalised', () => {
    const fish = v('5', 'FishAudio', 'Narrator', 'English', null, JSON.stringify({ languages: ['en', 'hi'] }));
    assert.equal(voiceServesLanguage(fish, 'Hindi'), true);
    assert.equal(voiceServesLanguage(fish, 'Tamil'), false);
    assert.equal(voiceServesLanguage(v('6', 'Cartesia', 'Sonic', 'en'), 'English'), true);
  });

  test('a workspace clone is always offered', () => {
    const clone = v('7', 'Custom', 'My voice', null, null, JSON.stringify({ clonedProvider: 'fishaudio' }));
    assert.equal(voiceServesLanguage(clone, 'Tamil'), true);
  });
});

describe('buildPickerList', () => {
  const voices = [
    v('g-us', 'Google', 'en-US-Chirp3-HD-Despina', 'English', 'American'),
    v('g-in', 'Google', 'en-IN-Chirp3-HD-Despina', 'English', 'Indian'),
    v('g-hi', 'Google', 'hi-IN-Chirp3-HD-Despina', 'Hindi', 'Indian'),
    v('s-ritu', 'Sarvam', 'ritu', 'Hindi', 'Indian'),
    v('e-rachel', 'ElevenLabs', 'Rachel', 'English', 'American'),
    v('f-priya', 'FishAudio', 'Priya', 'Hindi', null, JSON.stringify({ languages: ['hi'] })),
    v('s-priya', 'Sarvam', 'priya', 'Bengali', 'Indian'),
    v('clone', 'Custom', 'Owner voice', null, null, JSON.stringify({ clonedProvider: 'elevenlabs' })),
  ];

  test('entries are a name and a category line — no provider anywhere', () => {
    const list = buildPickerList(voices, { languages: ['Hindi'] });
    for (const entry of list) {
      assert.deepEqual(Object.keys(entry).sort(), ['category', 'id', 'name']);
      assert.doesNotMatch(entry.category, /Google|Sarvam|ElevenLabs|FishAudio|Fish|Cartesia/);
    }
  });

  test('one entry per voice: a locale copy in the primary language wins', () => {
    const list = buildPickerList(voices, { languages: ['Hindi', 'English (Indian)'] });
    const despina = list.filter((e) => e.name === 'Despina');
    assert.deepEqual(despina.map((e) => e.id), ['g-hi']);
  });

  test('the accent breaks the tie for an English agent', () => {
    const list = buildPickerList(voices, { languages: ['English (Indian)'] });
    assert.deepEqual(list.filter((e) => e.name === 'Despina').map((e) => e.id), ['g-in']);
  });

  test('the same name from two providers is two voices, not a duplicate', () => {
    const list = buildPickerList(voices, { languages: ['Hindi'] });
    assert.equal(list.filter((e) => e.name === 'Priya').length, 2);
  });

  test('voices that cannot speak the language are left out', () => {
    const ids = buildPickerList(voices, { languages: ['Hindi'] }).map((e) => e.id);
    assert.ok(!ids.includes('g-us'));
    assert.ok(!ids.includes('g-in'));
  });

  test('current voice first, then clones, then a stable mix', () => {
    const a = buildPickerList(voices, { languages: ['Hindi'], currentVoiceId: 's-ritu' });
    const b = buildPickerList([...voices].reverse(), { languages: ['Hindi'], currentVoiceId: 's-ritu' });
    assert.equal(a[0].id, 's-ritu');
    assert.equal(a[1].id, 'clone');
    // Input order does not change the output order.
    assert.deepEqual(a, b);
  });

  test('search matches the shown name', () => {
    assert.deepEqual(buildPickerList(voices, { languages: ['Hindi'], q: 'desp' }).map((e) => e.id), ['g-hi']);
  });

  test('never empty just because tags were thin', () => {
    const list = buildPickerList([v('x', 'Google', 'ja-JP-Chirp3-HD-Aoede', 'Japanese')], { languages: ['Hindi'] });
    assert.equal(list.length, 1);
  });
});

describe('category line', () => {
  const voice = (provider, { gender = null, category = null, metadata = null } = {}) => ({
    id: 'x', name: 'x', gender, category, metadata, provider: { name: provider },
  });

  test('use case and gender, joined', () => {
    const sarvam = voice('Sarvam', { gender: 'female', category: 'conversational', metadata: JSON.stringify({ style: null }) });
    assert.equal(voiceCategoryLabel(sarvam), 'Conversational · Female');
  });

  test('Fish tags: the use case a voice agent cares about wins, style words are ignored', () => {
    const fish = voice('FishAudio', {
      gender: 'male',
      category: 'premade',
      metadata: JSON.stringify({ tags: ['male', 'energetic', 'entertainment', 'narration', 'middle-aged'] }),
    });
    assert.equal(voiceCategoryLabel(fish), 'Narration · Male');
    const both = voice('FishAudio', { metadata: JSON.stringify({ tags: ['narration', 'Conversational'] }) });
    assert.equal(voiceCategoryLabel(both), 'Conversational');
  });

  test('ElevenLabs use_case labels are normalised', () => {
    const el = voice('ElevenLabs', { gender: 'Female', metadata: { labels: { use_case: 'narrative_story' } } });
    assert.equal(voiceCategoryLabel(el), 'Storytelling · Female');
  });

  test('a stored category that is not a use case is not shown', () => {
    assert.equal(voiceCategoryLabel(voice('Cartesia', { gender: 'feminine', category: 'premade' })), 'Female');
    assert.equal(voiceCategoryLabel(voice('Google', { gender: 'MALE', category: 'WaveNet' })), 'Male');
    assert.equal(voiceCategoryLabel(voice('ElevenLabs', { category: 'professional' })), '');
  });

  test('a workspace clone is just "Cloned"', () => {
    const clone = voice('Custom', { gender: 'female', metadata: JSON.stringify({ clonedProvider: 'fishaudio', tags: ['conversational'] }) });
    assert.equal(voiceCategoryLabel(clone), 'Cloned');
  });

  test('nothing known and broken metadata give an empty line, not an error', () => {
    assert.equal(voiceCategoryLabel(voice('FishAudio', { metadata: '{not json' })), '');
    assert.equal(voiceCategoryLabel(null), '');
  });

  test('the picker list carries the line', () => {
    const list = buildPickerList([
      { id: 's', name: 'ritu', language: 'Hindi', gender: 'female', category: 'conversational', provider: { name: 'Sarvam' } },
    ], { languages: ['Hindi'] });
    assert.equal(list[0].category, 'Conversational · Female');
  });
});
