import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAnsweringMachineDetector } from '../answeringMachineDetector.js';

describe('createAnsweringMachineDetector', () => {
  test('identifies human answering with standard "Hello?" greeting', () => {
    const amd = createAnsweringMachineDetector();
    const res = amd.processUtterance('Hello?', 250);
    assert.equal(res.isMachine, false);
    assert.equal(res.reason, 'human_short_burst');
    assert.ok(res.confidence >= 0.85);
  });

  test('detects voicemail phrase in greeting', () => {
    const amd = createAnsweringMachineDetector();
    const res = amd.processUtterance('Please leave a message after the tone.', 1200);
    assert.equal(res.isMachine, true);
    assert.equal(res.reason, 'phrase_match');
    assert.ok(res.confidence >= 0.9);
  });

  test('detects long monologue greeting as answering machine', () => {
    const amd = createAnsweringMachineDetector({ longSpeechDurationMs: 1500 });
    amd.processUtterance('Hi you have reached Dr Smith dental clinic we are currently closed for lunch', 800);
    const res = amd.processUtterance('please call back between two and five pm or check our website', 900);
    assert.equal(res.isMachine, true);
    assert.equal(res.reason, 'long_greeting');
  });

  test('keeps pending status during ambiguous initial words', () => {
    const amd = createAnsweringMachineDetector({ maxEvalWindowMs: 5000 });
    const res = amd.processUtterance('Well', 200);
    assert.equal(res.pending, true);
    assert.equal(amd.isComplete(), false);
  });
});
