import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSelfHearingFilter,
  calculatePcmRms,
  processAudioFrame,
  getOpusResilienceConfig,
} from '../acousticFilter.js';

describe('createSelfHearingFilter', () => {
  test('detects exact phrase echo of recent agent speech', () => {
    const filter = createSelfHearingFilter();
    filter.registerAgentSpeech('How can I help you today?');

    const result = filter.checkIsEcho('How can I help you today?');
    assert.equal(result.isEcho, true);
    assert.ok(result.confidence >= 0.9);
  });

  test('detects partial echo loopback', () => {
    const filter = createSelfHearingFilter();
    filter.registerAgentSpeech('Thank you for calling customer service.');

    const result = filter.checkIsEcho('for calling customer service');
    assert.equal(result.isEcho, true);
  });

  test('does not flag distinct customer query as echo', () => {
    const filter = createSelfHearingFilter();
    filter.registerAgentSpeech('Thank you for calling customer service.');

    const result = filter.checkIsEcho('I want to cancel my order 12345');
    assert.equal(result.isEcho, false);
  });

  test('ignores very short transcripts', () => {
    const filter = createSelfHearingFilter();
    filter.registerAgentSpeech('Yes, please continue.');

    const result = filter.checkIsEcho('hi');
    assert.equal(result.isEcho, false);
  });
});

describe('processAudioFrame & calculatePcmRms', () => {
  test('correctly calculates RMS for silent audio', () => {
    const silentBuffer = Buffer.alloc(320); // 160 16-bit samples = 20ms @ 8kHz
    const rms = calculatePcmRms(silentBuffer);
    assert.equal(rms, 0);
  });

  test('applies noise gate to silence sub-threshold audio', () => {
    const lowNoise = Buffer.alloc(320);
    // Fill with very low amplitude noise (around 100 out of 32768, RMS ~ 0.003)
    const int16 = new Int16Array(lowNoise.buffer, lowNoise.byteOffset, 160);
    int16.fill(100);

    const res = processAudioFrame(lowNoise, { noiseThreshold: 0.015 });
    assert.equal(res.isSpeech, false);
    assert.equal(res.gainApplied, 0);
  });

  test('applies AGC to boost quiet speech up to target RMS', () => {
    const quietSpeech = Buffer.alloc(320);
    const int16 = new Int16Array(quietSpeech.buffer, quietSpeech.byteOffset, 160);
    int16.fill(1500); // RMS ~ 0.045

    const res = processAudioFrame(quietSpeech, { targetRms: 0.12, agcEnabled: true });
    assert.equal(res.isSpeech, true);
    assert.ok(res.gainApplied > 1.0, 'Gain should be greater than 1.0 to amplify quiet speech');
  });
});

describe('getOpusResilienceConfig', () => {
  test('provides recommended Opus FEC and 20ms frame configurations', () => {
    const cfg = getOpusResilienceConfig();
    assert.equal(cfg.frameSizeMs, 20);
    assert.equal(cfg.fec, true);
    assert.equal(cfg.application, 'voip');
  });
});
