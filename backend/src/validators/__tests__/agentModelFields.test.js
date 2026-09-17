// What these pin: a client save can no longer choose a model. The LLM, the
// transcription settings and the bundled engine are removed from the payload
// (quietly, so an editor tab opened before this shipped can still save), a copy
// of an agent inherits its models from the server-side source row, and a
// language change is detected so a stale STT language can be dropped.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inheritedModelFields, sameLanguages, stripClientModelFields } from '../agentModelFields.js';

describe('stripClientModelFields', () => {
  test('removes every model choice and keeps everything else', () => {
    const input = {
      columns: { name: 'Hotel', voice: 'Sarvam - ritu', aiModel: 'gpt-4o', transcription: 'Azure' },
      extras: { callDirection: 'OUTBOUND', sttProvider: 'Sarvam', sttLanguage: 'Multi', sttSilenceTimeoutMs: 470, voiceEngine: 'xai', speculation: 'candidate' },
    };
    const out = stripClientModelFields(input);
    assert.deepEqual(out.columns, { name: 'Hotel', voice: 'Sarvam - ritu' });
    assert.deepEqual(out.extras, { callDirection: 'OUTBOUND', speculation: 'candidate' });
    assert.deepEqual(out.dropped.sort(), ['aiModel', 'sttLanguage', 'sttProvider', 'sttSilenceTimeoutMs', 'transcription', 'voiceEngine']);
  });

  test('does not mutate the payload it was given', () => {
    const input = { columns: { aiModel: 'gpt-4o' }, extras: { voiceEngine: 'xai' } };
    stripClientModelFields(input);
    assert.equal(input.columns.aiModel, 'gpt-4o');
    assert.equal(input.extras.voiceEngine, 'xai');
  });

  test('a payload with nothing to remove passes through', () => {
    const out = stripClientModelFields({ columns: { name: 'A' }, extras: {} });
    assert.deepEqual(out, { columns: { name: 'A' }, extras: {}, dropped: [] });
  });
});

describe('inheritedModelFields', () => {
  test('a copy keeps the source agent\'s models and engine settings', () => {
    const out = inheritedModelFields({
      aiModel: 'gemini-2.5-flash',
      transcription: 'Sarvam',
      settings: JSON.stringify({ sttLanguage: 'Hindi', voiceEngine: 'modular', speculation: 'fast' }),
    });
    assert.deepEqual(out.columns, { aiModel: 'gemini-2.5-flash', transcription: 'Sarvam' });
    // Only the locked keys travel this way; ordinary settings come from the copy's own payload.
    assert.deepEqual(out.settings, { sttLanguage: 'Hindi', voiceEngine: 'modular' });
  });

  test('a source created after assignment existed copies as a new agent', () => {
    const out = inheritedModelFields({ aiModel: '', transcription: '', settings: 'not json' });
    assert.deepEqual(out, { columns: { aiModel: '', transcription: '' }, settings: {} });
  });
});

describe('sameLanguages', () => {
  test('compares stored JSON with a request array, in order', () => {
    assert.equal(sameLanguages(['Hindi', 'English (Indian)'], '["Hindi","English (Indian)"]'), true);
    assert.equal(sameLanguages(['English (Indian)', 'Hindi'], '["Hindi","English (Indian)"]'), false);
    assert.equal(sameLanguages(['Tamil'], '["Hindi"]'), false);
    assert.equal(sameLanguages([], null), true);
  });
});
