// What these pin: the transfer, speculation and hold-pause fields that live in
// the agent's settings JSON are validated on the way in — a number that is not
// dialable, a timeout outside the carrier's range, hours that cannot be
// evaluated, or a hold no caller would sit through are refused with a message,
// and valid input is normalised (E.164, sorted days, one spelling of "off").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentSettings } from '../agentSettings.validator.js';

describe('validateAgentSettings', () => {
  test('passes unrelated settings through untouched', () => {
    const r = validateAgentSettings({ fillerWords: true, speakingRate: 1.1 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.extras, { fillerWords: true, speakingRate: 1.1 });
  });
  test('normalises a transfer number and rejects a non-number', () => {
    assert.equal(validateAgentSettings({ transferNumber: '+91 98765-43210' }).extras.transferNumber, '+919876543210');
    assert.equal(validateAgentSettings({ transferNumber: '' }).extras.transferNumber, '');
    const bad = validateAgentSettings({ transferNumber: 'front desk' });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /international number/);
    assert.equal(validateAgentSettings({ transferNumber: '98765 43210' }).ok, false, 'no country code');
  });
  test('mode, timeout, out-of-hours and speculation are enumerated / bounded', () => {
    assert.equal(validateAgentSettings({ transferMode: 'attended' }).ok, false);
    assert.equal(validateAgentSettings({ transferMode: 'immediate' }).ok, true);
    assert.equal(validateAgentSettings({ transferTimeoutSec: 2 }).ok, false);
    assert.equal(validateAgentSettings({ transferTimeoutSec: '30' }).extras.transferTimeoutSec, 30);
    assert.equal(validateAgentSettings({ transferOutOfHours: 'voicemail' }).ok, false);
    assert.equal(validateAgentSettings({ transferOutOfHours: 'attempt' }).ok, true);
    assert.equal(validateAgentSettings({ speculation: 'aggressive' }).ok, false);
    assert.equal(validateAgentSettings({ speculation: 'interim' }).ok, true);
  });
  test('hold pause is a whole number of seconds from 1 to 10; empty or 0 turns it off', () => {
    assert.equal(validateAgentSettings({ holdPauseSec: 5 }).extras.holdPauseSec, 5);
    assert.equal(validateAgentSettings({ holdPauseSec: '10' }).extras.holdPauseSec, 10);
    assert.equal(validateAgentSettings({ holdPauseSec: 1 }).extras.holdPauseSec, 1);
    for (const off of ['', 0, '0']) {
      const r = validateAgentSettings({ holdPauseSec: off });
      assert.equal(r.ok, true, JSON.stringify(off));
      assert.equal(r.extras.holdPauseSec, null, JSON.stringify(off));
    }
    assert.equal(validateAgentSettings({ holdPauseSec: null }).ok, true, 'null is how the editor clears it');
    for (const bad of [11, -1, 2.5, 'abc', true, 60]) {
      const r = validateAgentSettings({ holdPauseSec: bad });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.match(r.error, /Hold pause must be a whole number of seconds from 1 to 10/);
    }
  });
  test('hours need HH:MM, at least one weekday and a real timezone', () => {
    assert.equal(validateAgentSettings({ transferHours: { enabled: true, start: '9', end: '18:00', days: [1] } }).ok, false);
    assert.equal(validateAgentSettings({ transferHours: { enabled: true, start: '09:00', end: '18:00', days: [] } }).ok, false);
    assert.equal(validateAgentSettings({ transferHours: { enabled: true, start: '09:00', end: '18:00', days: [1], timezone: 'Mars/Olympus' } }).ok, false);
    const ok = validateAgentSettings({ transferHours: { enabled: true, start: '09:00', end: '18:00', days: [5, 1, 1, 3], timezone: 'Asia/Kolkata' } });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.extras.transferHours, { enabled: true, start: '09:00', end: '18:00', days: [1, 3, 5], timezone: 'Asia/Kolkata' });
    assert.deepEqual(validateAgentSettings({ transferHours: { enabled: false, start: 'x' } }).extras.transferHours, { enabled: false });
  });
});
