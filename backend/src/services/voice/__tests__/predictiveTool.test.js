import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPredictiveIntent,
  createPredictiveLookupCache,
} from '../predictiveTool.js';

test('predictiveTool', async (t) => {
  await t.test('extracts order status intent and ID from interim customer speech', () => {
    const input = 'Hey, can you track order number ORD-98241 for me?';
    const result = extractPredictiveIntent(input);
    assert.equal(result.matched, true);
    assert.equal(result.intent, 'order_status');
    assert.equal(result.params.order_id, 'ORD-98241');
  });

  await t.test('extracts flight status intent and code from query', () => {
    const input = 'Can you check flight AI-202 status today?';
    const result = extractPredictiveIntent(input);
    assert.equal(result.matched, true);
    assert.equal(result.intent, 'flight_status');
    assert.equal(result.params.flight_number, 'AI-202');
  });

  await t.test('extracts email lookup from speech', () => {
    const input = 'My email is vikram.malhotra@example.com please check my booking';
    const result = extractPredictiveIntent(input);
    assert.equal(result.matched, true);
    assert.equal(result.intent, 'email_lookup');
    assert.equal(result.params.email, 'vikram.malhotra@example.com');
  });

  await t.test('returns matched: false on plain conversation without identifiers', () => {
    const input = 'Good morning, I was wondering how your service works?';
    const result = extractPredictiveIntent(input);
    assert.equal(result.matched, false);
    assert.equal(result.intent, null);
  });

  await t.test('createPredictiveLookupCache tracks and returns parallel query promises', async () => {
    const cache = createPredictiveLookupCache();
    const mockPromise = Promise.resolve({ status: 'Shipped', eta: 'Tomorrow' });
    cache.track('order_ORD-98241', mockPromise);

    const hit = cache.get('order_ORD-98241');
    assert.ok(hit !== null);
    const data = await hit;
    assert.equal(data.status, 'Shipped');

    cache.clear();
    assert.equal(cache.get('order_ORD-98241'), null);
  });
});
