// What these pin: which AI and transcription model a call runs on, now that
// Super Admin assigns them. The precedence is client override → the model an
// older agent kept → platform default → the deployment's own default, and each
// level is independent, so an untouched deployment runs exactly what it ran
// before. Pure functions only — nothing here touches a database.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STT, normaliseState, pickAssignedModels } from '../modelAssignments.js';

const NEW_AGENT = { aiModel: '', transcription: '' };
const OLD_AGENT = { aiModel: 'gemini-2.5-flash', transcription: 'Sarvam' };

describe('pickAssignedModels', () => {
  test('nothing assigned: a new agent runs the server defaults', () => {
    const m = pickAssignedModels({ agent: NEW_AGENT });
    assert.deepEqual(m.llm, { value: null, source: 'server' });
    assert.deepEqual(m.stt, { value: DEFAULT_STT, source: 'server' });
  });

  test('an older agent keeps what it runs today, whatever the platform default says', () => {
    const m = pickAssignedModels({ agent: OLD_AGENT, defaults: { llm: 'gpt-4o-mini', stt: 'deepgram-nova-3' } });
    assert.deepEqual(m.llm, { value: 'gemini-2.5-flash', source: 'agent' });
    // Its stored "Sarvam" never chose the live recogniser; the per-language
    // pick is what it really runs, so that is what it keeps.
    assert.deepEqual(m.stt, { value: DEFAULT_STT, source: 'agent' });
  });

  test('a new agent runs the platform default', () => {
    const m = pickAssignedModels({ agent: NEW_AGENT, defaults: { llm: 'gpt-4o-mini', stt: 'deepgram-nova-3' } });
    assert.deepEqual(m.llm, { value: 'gpt-4o-mini', source: 'platform' });
    assert.deepEqual(m.stt, { value: 'deepgram-nova-3', source: 'platform' });
  });

  test('a client override beats the platform default AND an older agent\'s own model', () => {
    const client = { llm: 'Groq Llama 3.3', stt: 'deepgram-nova-3' };
    const defaults = { llm: 'gpt-4o-mini', stt: 'deepgram-auto' };
    for (const agent of [NEW_AGENT, OLD_AGENT]) {
      const m = pickAssignedModels({ agent, client, defaults });
      assert.deepEqual(m.llm, { value: 'Groq Llama 3.3', source: 'client' });
      assert.deepEqual(m.stt, { value: 'deepgram-nova-3', source: 'client' });
    }
  });

  test('each stage resolves on its own: an LLM-only override leaves transcription alone', () => {
    const m = pickAssignedModels({ agent: NEW_AGENT, client: { llm: 'gpt-4o' }, defaults: { stt: 'deepgram-nova-3' } });
    assert.equal(m.llm.source, 'client');
    assert.deepEqual(m.stt, { value: 'deepgram-nova-3', source: 'platform' });
  });

  test('blank strings count as not set, at every level', () => {
    const m = pickAssignedModels({ agent: { aiModel: '  ', transcription: '' }, client: { llm: '' }, defaults: { llm: ' ' } });
    assert.equal(m.llm.source, 'server');
    assert.equal(m.stt.source, 'server');
  });

  test('a missing agent row resolves to the defaults rather than throwing', () => {
    assert.equal(pickAssignedModels({ defaults: { llm: 'gpt-4o' } }).llm.value, 'gpt-4o');
    assert.equal(pickAssignedModels().llm.source, 'server');
  });
});

describe('normaliseState', () => {
  test('anything unusable becomes "nothing assigned"', () => {
    for (const bad of [null, undefined, 'x', 42, [], { defaults: 'x', workspaces: [] }]) {
      assert.deepEqual(normaliseState(bad), { defaults: { llm: null, stt: null }, workspaces: {} });
    }
  });

  test('keeps real overrides and drops empty ones', () => {
    const out = normaliseState({
      defaults: { llm: ' gpt-4o ', stt: '' },
      workspaces: { a: { llm: 'gpt-4o-mini' }, b: { llm: '', stt: null }, c: { stt: 'deepgram-nova-3', junk: 1 } },
    });
    assert.deepEqual(out, {
      defaults: { llm: 'gpt-4o', stt: null },
      workspaces: { a: { llm: 'gpt-4o-mini' }, c: { stt: 'deepgram-nova-3' } },
    });
  });
});
