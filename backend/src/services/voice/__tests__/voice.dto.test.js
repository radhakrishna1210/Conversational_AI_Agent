// backend/src/services/voice/__tests__/voice.dto.test.js
/**
 * Unit tests for VoiceDTO normalisation helpers.
 * Run with: node --test src/services/voice/__tests__/voice.dto.test.js
 * (Node.js built-in test runner, no external test framework required)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGoogleLocale,
  fromGoogleVoice,
  fromElevenLabsVoice,
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

  it('sets gender correctly', () => {
    const dto = fromGoogleVoice(raw);
    assert.equal(dto.gender, 'FEMALE');
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
    assert.equal(dto.gender, 'Female');
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
