// backend/src/services/voice/__tests__/voiceSync.service.test.js
/**
 * Unit tests for VoiceSyncService.
 * Uses an in-memory mock of prisma to avoid needing a live DB.
 *
 * Run with: node --test src/services/voice/__tests__/voiceSync.service.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fromGoogleVoice, fromElevenLabsVoice } from '../voice.dto.js';

// ─── Sync result shape tests (pure logic, no DB required) ────────────────────

describe('VoiceDTO – syncProvider result shape', () => {
  it('fromGoogleVoice returns all required DTO fields', () => {
    const raw = {
      name: 'en-US-Neural2-A',
      languageCodes: ['en-US'],
      ssmlGender: 'MALE',
      naturalSampleRateHertz: 24000,
    };
    const dto = fromGoogleVoice(raw);
    const required = ['providerVoiceId', 'name', 'language', 'accent', 'gender', 'category', 'metadata'];
    for (const field of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(dto, field), `Missing field: ${field}`);
    }
  });

  it('fromElevenLabsVoice returns all required DTO fields', () => {
    const raw = {
      voice_id: 'test-id',
      name: 'Josh',
      category: 'premade',
      labels: { accent: 'American', gender: 'Male', language: 'English' },
    };
    const dto = fromElevenLabsVoice(raw);
    const required = ['providerVoiceId', 'name', 'language', 'accent', 'gender', 'category', 'metadata'];
    for (const field of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(dto, field), `Missing field: ${field}`);
    }
  });

  it('Google DTO metadata is serialisable JSON', () => {
    const raw = {
      name: 'en-GB-Wavenet-B',
      languageCodes: ['en-GB'],
      ssmlGender: 'MALE',
      naturalSampleRateHertz: 16000,
    };
    const dto = fromGoogleVoice(raw);
    assert.doesNotThrow(() => JSON.parse(dto.metadata));
  });

  it('ElevenLabs DTO metadata contains previewUrl', () => {
    const raw = {
      voice_id: 'abc',
      name: 'Nicole',
      category: 'premade',
      preview_url: 'https://preview.test/audio.mp3',
      labels: {},
    };
    const dto = fromElevenLabsVoice(raw);
    const meta = JSON.parse(dto.metadata);
    assert.equal(meta.previewUrl, 'https://preview.test/audio.mp3');
  });
});

describe('Upsert key integrity', () => {
  it('two voices from same provider with different IDs produce distinct composite keys', () => {
    const raw1 = { name: 'en-US-Neural2-A', languageCodes: ['en-US'], ssmlGender: 'MALE', naturalSampleRateHertz: 24000 };
    const raw2 = { name: 'en-US-Neural2-B', languageCodes: ['en-US'], ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 };
    const dto1 = fromGoogleVoice(raw1);
    const dto2 = fromGoogleVoice(raw2);
    assert.notEqual(dto1.providerVoiceId, dto2.providerVoiceId);
  });

  it('same voice name maps to same providerVoiceId on each call (idempotent)', () => {
    const raw = { name: 'en-IN-Chirp3-HD-Despina', languageCodes: ['en-IN'], ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 };
    const dto1 = fromGoogleVoice(raw);
    const dto2 = fromGoogleVoice(raw);
    assert.equal(dto1.providerVoiceId, dto2.providerVoiceId);
  });
});
