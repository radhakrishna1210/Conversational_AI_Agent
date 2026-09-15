// An integration's saved sync interval is actually honoured.
//
// settingsJson is a String column, and the scheduler read a property straight
// off the string — always undefined, so every integration used the default.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { syncIntervalMinutes } = await import('../integrationScheduler.service.js');

const withSettings = (settingsJson) => ({ settings: { settingsJson } });

test('reads the interval out of the stored JSON string', () => {
  assert.equal(syncIntervalMinutes(withSettings(JSON.stringify({ syncIntervalMinutes: 120 }))), 120);
});

test('defaults to 30 when nothing usable is saved', () => {
  for (const v of [undefined, null, '', '{}', 'not json', JSON.stringify({ syncIntervalMinutes: 'soon' }), JSON.stringify({ syncIntervalMinutes: 0 })]) {
    assert.equal(syncIntervalMinutes(withSettings(v)), 30, String(v));
  }
  assert.equal(syncIntervalMinutes({}), 30);
});

test('a tiny interval is floored so it cannot sync on every tick', () => {
  assert.equal(syncIntervalMinutes(withSettings(JSON.stringify({ syncIntervalMinutes: 1 }))), 5);
});

test('an already-parsed object still works', () => {
  assert.equal(syncIntervalMinutes(withSettings({ syncIntervalMinutes: 45 })), 45);
});
