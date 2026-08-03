// backend/src/services/voice/__tests__/voice.dto.test.js
/**
 * Unit tests for VoiceDTO normalisation helpers.
 * Run with: node --test src/services/voice/__tests__/voice.dto.test.js
 * (Node.js built-in test runner, no external test framework required)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromFishAudioVoice,
  parseGoogleLocale,
  fromGoogleVoice,
  fromElevenLabsVoice,
  normalizeLanguage,
  normalizeAccent,
  normalizeGender,
} from '../voice.dto.js';

// ─── parseGoogleLocale ────────────────────────────────────────────────────────

describe('parseGoogleLocale', () => {
  it('parses "en-IN" → English / Indian', () => {
    const result = parseGoogleLocale('en-IN');
    assert.equal(result.language, 'English');
    assert.equal(result.accent, 'Indian');
  });

  it('parses "en-US" → English / American', () => {
    const result = parseGoogleLocale('en-US');
    assert.equal(result.language, 'English');
    assert.equal(result.accent, 'American');
  });

  it('parses "hi-IN" → Hindi / Indian', () => {
    const result = parseGoogleLocale('hi-IN');
    assert.equal(result.language, 'Hindi');
    assert.equal(result.accent, 'Indian');
  });

  it('handles unknown codes gracefully', () => {
    const result = parseGoogleLocale('xx-ZZ');
    assert.equal(result.language, 'xx');
    assert.equal(result.accent, 'ZZ');
  });

  it('handles empty string', () => {
    const result = parseGoogleLocale('');
    assert.equal(result.language, 'Unknown');
    assert.equal(result.accent, 'Unknown');
  });
});

// ─── fromGoogleVoice ──────────────────────────────────────────────────────────

describe('fromGoogleVoice', () => {
  const raw = {
    name: 'en-IN-Chirp3-HD-Despina',
    languageCodes: ['en-IN'],
    ssmlGender: 'FEMALE',
    naturalSampleRateHertz: 24000,
  };

  it('maps providerVoiceId to voice name', () => {
    const dto = fromGoogleVoice(raw);
    assert.equal(dto.providerVoiceId, 'en-IN-Chirp3-HD-Despina');
  });

  it('normalises gender to lowercase', () => {
    const dto = fromGoogleVoice(raw);
    assert.equal(dto.gender, 'female');
  });

  it('defaults missing gender to neutral', () => {
    const dto = fromGoogleVoice({ ...raw, ssmlGender: undefined });
    assert.equal(dto.gender, 'neutral');
  });

  it('detects Chirp HD category', () => {
    const dto = fromGoogleVoice(raw);
    assert.equal(dto.category, 'Chirp HD');
  });

  it('detects WaveNet category', () => {
    const dto = fromGoogleVoice({ ...raw, name: 'en-US-Wavenet-A', languageCodes: ['en-US'] });
    assert.equal(dto.category, 'WaveNet');
  });

  it('sets language and accent from locale', () => {
    const dto = fromGoogleVoice(raw);
    assert.equal(dto.language, 'English');
    assert.equal(dto.accent, 'Indian');
  });

  it('stores raw locale in metadata', () => {
    const dto = fromGoogleVoice(raw);
    const meta = JSON.parse(dto.metadata);
    assert.equal(meta.locale, 'en-IN');
    assert.equal(meta.naturalSampleRateHertz, 24000);
  });
});

// ─── fromElevenLabsVoice ──────────────────────────────────────────────────────

describe('fromElevenLabsVoice', () => {
  const raw = {
    voice_id: 'abc123',
    name: 'Rachel',
    category: 'premade',
    description: 'A calm American female voice',
    preview_url: 'https://storage.googleapis.com/eleven-preview.mp3',
    labels: {
      accent: 'American',
      gender: 'Female',
      language: 'English',
    },
  };

  it('maps voice_id to providerVoiceId', () => {
    const dto = fromElevenLabsVoice(raw);
    assert.equal(dto.providerVoiceId, 'abc123');
  });

  it('extracts language from labels', () => {
    const dto = fromElevenLabsVoice(raw);
    assert.equal(dto.language, 'English');
  });

  it('extracts accent from labels', () => {
    const dto = fromElevenLabsVoice(raw);
    assert.equal(dto.accent, 'American');
  });

  it('extracts gender from labels', () => {
    const dto = fromElevenLabsVoice(raw);
    assert.equal(dto.gender, 'female');
  });

  it('normalises a Voice Library Indian voice to canonical labels', () => {
    // Shape seen on voices added from the ElevenLabs Voice Library: lowercase
    // free text, sometimes a bare language code instead of a name.
    const dto = fromElevenLabsVoice({
      voice_id: 'ind1',
      name: 'Monika Sogam',
      labels: { language: 'hi', accent: 'indian', gender: 'female' },
    });
    assert.equal(dto.language, 'Hindi');
    assert.equal(dto.accent, 'Indian');
    assert.equal(dto.gender, 'female');
  });

  it('matches Google labels for an Indian-accented English voice', () => {
    const el = fromElevenLabsVoice({
      voice_id: 'ind2',
      name: 'Kanika',
      labels: { language: 'english', accent: 'Indian', gender: 'Female' },
    });
    const google = fromGoogleVoice({
      name: 'en-IN-Wavenet-A',
      languageCodes: ['en-IN'],
      ssmlGender: 'FEMALE',
    });
    // Same filter values across providers — this is what makes the language and
    // gender dropdowns return both voices instead of only the Google one.
    assert.equal(el.language, google.language);
    assert.equal(el.accent, google.accent);
    assert.equal(el.gender, google.gender);
  });

  it('sets category', () => {
    const dto = fromElevenLabsVoice(raw);
    assert.equal(dto.category, 'premade');
  });

  it('stores preview_url in metadata', () => {
    const dto = fromElevenLabsVoice(raw);
    const meta = JSON.parse(dto.metadata);
    assert.equal(meta.previewUrl, raw.preview_url);
  });

  it('handles missing labels gracefully', () => {
    const dto = fromElevenLabsVoice({ voice_id: 'x', name: 'Test', labels: {} });
    assert.equal(dto.language, null);
    assert.equal(dto.accent, null);
    assert.equal(dto.gender, null);
  });
});

// ─── Label normalisation ──────────────────────────────────────────────────────

describe('normalizeLanguage', () => {
  it('maps codes, locales and names to one canonical name', () => {
    for (const input of ['hi', 'hi-IN', 'hindi', 'Hindi', '  HINDI  ']) {
      assert.equal(normalizeLanguage(input), 'Hindi', `failed for ${input}`);
    }
    assert.equal(normalizeLanguage('en'), 'English');
    assert.equal(normalizeLanguage('english'), 'English');
  });

  it('title-cases unknown values instead of dropping them', () => {
    assert.equal(normalizeLanguage('klingon'), 'Klingon');
  });

  it('returns null for empty input', () => {
    assert.equal(normalizeLanguage(''), null);
    assert.equal(normalizeLanguage(null), null);
    assert.equal(normalizeLanguage(undefined), null);
  });
});

describe('normalizeAccent', () => {
  it('maps names, region codes and locales to one canonical name', () => {
    for (const input of ['indian', 'Indian', 'IN', 'en-IN']) {
      assert.equal(normalizeAccent(input), 'Indian', `failed for ${input}`);
    }
    assert.equal(normalizeAccent('american'), 'American');
    assert.equal(normalizeAccent('british'), 'British');
  });

  it('title-cases unknown values', () => {
    assert.equal(normalizeAccent('us-southern'), 'Us Southern');
  });

  it('returns null for empty input', () => {
    assert.equal(normalizeAccent(''), null);
    assert.equal(normalizeAccent(null), null);
  });
});

describe('normalizeGender', () => {
  it('lowercases every provider spelling', () => {
    assert.equal(normalizeGender('FEMALE'), 'female');
    assert.equal(normalizeGender('Female'), 'female');
    assert.equal(normalizeGender('feminine'), 'female');
    assert.equal(normalizeGender('MALE'), 'male');
    assert.equal(normalizeGender('masculine'), 'male');
    assert.equal(normalizeGender('NEUTRAL'), 'neutral');
  });

  it('returns null for empty input', () => {
    assert.equal(normalizeGender(''), null);
    assert.equal(normalizeGender(null), null);
  });
});

describe('fromFishAudioVoice', () => {
  it('maps _id/title and canonicalises language + accent from a locale', () => {
    const dto = fromFishAudioVoice({
      _id: 'abc123', title: 'Riya', languages: ['en-US'], visibility: 'public',
    });
    assert.equal(dto.providerVoiceId, 'abc123');
    assert.equal(dto.name, 'Riya');
    // Must be canonical, or listVoices' language filter hides the voice.
    assert.equal(dto.language, 'English');
    assert.equal(dto.accent, 'American');
    assert.equal(dto.category, 'premade');
  });

  it('never derives an accent from a BARE language code', () => {
    // Regression (caught against the live API): Fish returns bare codes, and
    // normalizeAccent reads a 2-letter string as a REGION — so "ar" became
    // "Argentine" on an Arabic voice and "en" became the junk value "En".
    const ar = fromFishAudioVoice({ _id: 'x', title: 'V', languages: ['ar'] });
    assert.equal(ar.language, 'Arabic');
    assert.equal(ar.accent, null);
    const en = fromFishAudioVoice({ _id: 'y', title: 'V', languages: ['en'] });
    assert.equal(en.language, 'English');
    assert.equal(en.accent, null);
  });

  it('files a MULTILINGUAL voice under a preferred language, not just the first', () => {
    // Fish voices commonly list several languages; the Voice table has one
    // indexed `language` column and that is what the picker filters on.
    const raw = { _id: 'x', title: 'V', languages: ['es', 'pt', 'en', 'hi'] };
    assert.equal(fromFishAudioVoice(raw).language, 'Spanish');            // no preference
    assert.equal(fromFishAudioVoice(raw, { preferLanguages: ['hi'] }).language, 'Hindi');
    assert.equal(fromFishAudioVoice(raw, { preferLanguages: ['en', 'hi'] }).language, 'English');
  });

  it('falls back to the first language when no preference matches', () => {
    const raw = { _id: 'x', languages: ['ja'] };
    assert.equal(fromFishAudioVoice(raw, { preferLanguages: ['en', 'hi'] }).language, 'Japanese');
  });

  it('still derives an accent from a real locale or explicit field', () => {
    assert.equal(fromFishAudioVoice({ _id: 'x', languages: ['en-IN'] }).accent, 'Indian');
    assert.equal(fromFishAudioVoice({ _id: 'x', accent: 'british', languages: ['en'] }).accent, 'British');
  });

  it('reads gender from a tag when there is no gender field', () => {
    const dto = fromFishAudioVoice({ _id: 'x', title: 'V', tags: ['warm', 'Female'] });
    assert.equal(dto.gender, 'female');
  });

  it('leaves gender null rather than guessing when no signal exists', () => {
    const dto = fromFishAudioVoice({ _id: 'x', title: 'V', tags: ['warm'] });
    assert.equal(dto.gender, null);
  });

  it('marks non-public models as custom (clones land here)', () => {
    assert.equal(fromFishAudioVoice({ _id: 'x', visibility: 'private' }).category, 'custom');
  });

  it('tolerates a nearly empty model row', () => {
    const dto = fromFishAudioVoice({ _id: 'only-id' });
    assert.equal(dto.providerVoiceId, 'only-id');
    assert.equal(dto.name, 'Unknown Voice');
    assert.equal(dto.language, null);
  });

  it('emits parseable JSON metadata', () => {
    const dto = fromFishAudioVoice({ _id: 'x', state: 'trained', train_mode: 'fast' });
    const meta = JSON.parse(dto.metadata);
    assert.equal(meta.state, 'trained');
    assert.equal(meta.trainMode, 'fast');
  });
});
