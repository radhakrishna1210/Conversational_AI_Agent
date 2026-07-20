import test from 'node:test';
import assert from 'node:assert/strict';
import { collectExtractionDefinitions, materializeExtraction, parseExtractionResponse, transcriptToExtractionText } from '../postCallExtraction.utils.js';

test('collects enabled definitions and tracks configs', () => {
  const settings = JSON.stringify({ postCallConfigs: [
    { id: 'a', includeExtractedInformation: true, extractedVariables: [{ key: ' name ', description: 'Customer name' }] },
    { id: 'b', includeExtractedInformation: true, extractedVariables: [{ key: 'name', description: 'Duplicate' }] },
    { id: 'off', includeExtractedInformation: false, extractedVariables: [{ key: 'secret', description: 'Ignore' }] },
  ] });
  assert.deepEqual(collectExtractionDefinitions(settings), [
    { key: 'name', description: 'Customer name', configIds: ['a', 'b'] },
  ]);
});

test('formats valid turns', () => {
  assert.equal(transcriptToExtractionText([
    { role: 'assistant', content: 'Name?' },
    { role: 'user', content: 'Rahul' },
    { role: 'system', content: 'ignore' },
  ]), 'Agent: Name?\nCustomer: Rahul');
});

test('materializes requested values and nulls missing ones', () => {
  const definitions = [
    { key: 'name', description: 'Name', configIds: ['a'] },
    { key: 'budget', description: 'Budget', configIds: ['a'] },
  ];
  const parsed = parseExtractionResponse(JSON.stringify({ variables: {
    name: { value: 'Rahul', evidence: 'Rahul' }, unknown: { value: 'drop' },
  } }));
  assert.deepEqual(materializeExtraction(definitions, parsed), [
    { ...definitions[0], value: 'Rahul', evidence: 'Rahul' },
    { ...definitions[1], value: null, evidence: null },
  ]);
});

