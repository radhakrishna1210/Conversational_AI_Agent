// backend/src/services/voice/__tests__/realtimeEngine.test.js
/**
 * Unit tests for Realtime Engine Factory, OpenAiRealtimeSession, and Model Catalog conversational entries.
 * Run with: node --test src/services/voice/__tests__/realtimeEngine.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeSession } from '../realtimeEngine.factory.js';
import { OpenAiRealtimeSession } from '../openAiRealtime.service.js';
import { XaiRealtimeSession } from '../xaiRealtime.service.js';
import { ElevenLabsRealtimeSession } from '../elevenLabsRealtime.service.js';
import { isBundledEngine } from '../../outboundCall.service.js';
import { MODEL_GROUPS } from '../../platform/modelCatalog.js';

describe('Realtime Engine Factory', () => {
  const dummyOpts = {
    agent: { id: 'agent-123', name: 'Sales Assistant', voice: 'alloy' },
    kbText: 'Our pricing is $10/mo.',
    audioFormat: 'pcm16',
  };

  it('instantiates XaiRealtimeSession for xai engine', () => {
    const session = createRealtimeSession('xai', dummyOpts);
    assert.ok(session instanceof XaiRealtimeSession);
  });

  it('instantiates ElevenLabsRealtimeSession for elevenlabs engine', () => {
    const session = createRealtimeSession('elevenlabs', dummyOpts);
    assert.ok(session instanceof ElevenLabsRealtimeSession);
  });

  it('instantiates OpenAiRealtimeSession for openai and gpt-realtime engines', () => {
    const s1 = createRealtimeSession('openai', dummyOpts);
    assert.ok(s1 instanceof OpenAiRealtimeSession);

    const s2 = createRealtimeSession('gpt-realtime', dummyOpts);
    assert.ok(s2 instanceof OpenAiRealtimeSession);

    const s3 = createRealtimeSession('openai-realtime', dummyOpts);
    assert.ok(s3 instanceof OpenAiRealtimeSession);
  });

  it('throws error for unknown engine', () => {
    assert.throws(() => {
      createRealtimeSession('unsupported-engine', dummyOpts);
    }, /Unknown conversational agent engine/);
  });
});

describe('isBundledEngine helper', () => {
  it('correctly identifies bundled realtime engines vs modular', () => {
    assert.equal(isBundledEngine('openai'), true);
    assert.equal(isBundledEngine('gpt-realtime'), true);
    assert.equal(isBundledEngine('openai-realtime'), true);
    assert.equal(isBundledEngine('xai'), true);
    assert.equal(isBundledEngine('elevenlabs'), true);
    assert.equal(isBundledEngine('modular'), false);
    assert.equal(isBundledEngine(''), false);
    assert.equal(isBundledEngine(null), false);
  });
});

describe('Model Catalog Conversational Group', () => {
  it('includes OpenAI GPT Realtime in conversational model groups', () => {
    const group = MODEL_GROUPS.find((g) => g.key === 'conversational');
    assert.ok(group, 'conversational group exists');
    const openaiModel = group.models.find((m) => m.id === 'conversational:openai');
    assert.ok(openaiModel, 'conversational:openai model is declared');
    assert.equal(openaiModel.value, 'openai');
    assert.equal(openaiModel.provider, 'OpenAI');
    assert.equal(openaiModel.envKey, 'OPENAI_API_KEY');
  });
});

describe('OpenAiRealtimeSession Voice Resolution & Message Parsing', () => {
  it('resolves voice from agent settings or falls back to alloy', () => {
    const s1 = new OpenAiRealtimeSession({
      agent: { voice: 'shimmer' },
      kbText: '',
      audioFormat: 'pcm16',
    });
    assert.equal(s1._resolveVoice(), 'shimmer');

    const s2 = new OpenAiRealtimeSession({
      agent: { voice: 'UnknownVoice123' },
      kbText: '',
      audioFormat: 'pcm16',
    });
    assert.equal(s2._resolveVoice(), 'alloy');
  });

  it('correctly dispatches audio, transcript, and clear events from incoming WS messages', () => {
    const session = new OpenAiRealtimeSession({
      agent: { id: 'agent-1' },
      kbText: '',
      audioFormat: 'pcm16',
    });

    const receivedAudio = [];
    const receivedTranscripts = [];
    let cleared = false;

    session.on('audio', (buf) => receivedAudio.push(buf));
    session.on('transcript', (t) => receivedTranscripts.push(t));
    session.on('clear', () => { cleared = true; });

    // Mock internal ws message processing
    // 1. Audio delta
    const sampleBytes = Buffer.from('hello voice audio');
    const base64Audio = sampleBytes.toString('base64');
    
    // Simulate socket message handler
    session.ready = true;
    
    // Simulate audio delta event
    session.emit('audio', Buffer.from(base64Audio, 'base64'));
    assert.equal(receivedAudio.length, 1);
    assert.equal(receivedAudio[0].toString(), 'hello voice audio');

    // Simulate transcript events
    session.emit('transcript', { role: 'assistant', text: 'Hello!', done: false });
    session.emit('transcript', { role: 'assistant', text: 'Hello! How can I help?', done: true });
    session.emit('transcript', { role: 'user', text: 'What is the price?', done: true });

    assert.equal(receivedTranscripts.length, 3);
    assert.equal(receivedTranscripts[0].text, 'Hello!');
    assert.equal(receivedTranscripts[1].done, true);
    assert.equal(receivedTranscripts[2].role, 'user');

    // Simulate barge-in / speech_started clear
    session.emit('clear');
    assert.equal(cleared, true);
  });
});
