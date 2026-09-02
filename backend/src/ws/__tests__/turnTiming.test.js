import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurnTiming } from '../turnTiming.js';

describe('turn-timing frame validation', () => {
  test('accepts a well-formed frame and rounds to whole ms', () => {
    const t = parseTurnTiming({
      type: 'turn-timing', turnId: 'a1b2c3d4:7',
      speechEndToAudibleMs: 1234.6, endTurnToAudibleMs: 512.2, clientEndpointMs: 722.4, filler: false,
    });
    assert.deepEqual(t, {
      turnId: 'a1b2c3d4:7', speechEndToAudibleMs: 1235, endTurnToAudibleMs: 512, clientEndpointMs: 722, perceivedMs: null, filler: false,
    });
  });

  test('refuses frames without a turnId or with a malformed one', () => {
    assert.equal(parseTurnTiming({ speechEndToAudibleMs: 100 }), null);
    assert.equal(parseTurnTiming({ turnId: 'not a turn id', speechEndToAudibleMs: 100 }), null);
    assert.equal(parseTurnTiming({ turnId: 'x'.repeat(40) + ':1', speechEndToAudibleMs: 100 }), null);
  });

  test('drops implausible numbers individually, and the frame if nothing usable remains', () => {
    const t = parseTurnTiming({ turnId: 'ab:1', speechEndToAudibleMs: -5, endTurnToAudibleMs: 300, clientEndpointMs: 1e9 });
    assert.deepEqual(t, { turnId: 'ab:1', speechEndToAudibleMs: null, endTurnToAudibleMs: 300, clientEndpointMs: null, perceivedMs: null, filler: false });
    assert.equal(parseTurnTiming({ turnId: 'ab:1', speechEndToAudibleMs: 'NaN', endTurnToAudibleMs: null }), null);
  });

  test('is defensive about non-object input', () => {
    for (const bad of [null, undefined, 'turn-timing', 42, []]) assert.equal(parseTurnTiming(bad), null);
  });

  test('filler is only true when literally true', () => {
    assert.equal(parseTurnTiming({ turnId: 'ab:1', endTurnToAudibleMs: 1, filler: 'yes' }).filler, false);
    assert.equal(parseTurnTiming({ turnId: 'ab:1', endTurnToAudibleMs: 1, filler: true }).filler, true);
  });
});
