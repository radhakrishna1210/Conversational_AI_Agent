// backend/src/services/plivo/__tests__/inbound.test.js
//
// An inbound call is identified only by the number it rang, and the carrier
// sends that number in its own format. Get the conversion wrong and every
// inbound call to a rented number hears "not in service" — on a number the
// client is paying for.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { e164FromCarrier } = await import('../inbound.service.js');

describe('e164FromCarrier', () => {
  test('adds the plus Plivo strips', () => {
    // VoiceNumber.phoneNumber is stored "+912269851741"; Plivo sends the digits.
    assert.equal(e164FromCarrier('912269851741'), '+912269851741');
  });

  test('leaves an already-E.164 number alone', () => {
    assert.equal(e164FromCarrier('+912269851741'), '+912269851741');
  });

  test('strips the formatting a human or a carrier might add', () => {
    assert.equal(e164FromCarrier(' 91 2269-851741 '), '+912269851741');
  });

  test('refuses a SIP URI rather than reducing it to stray digits', () => {
    // "sip:1001@example.com" would otherwise become "+1001" and look up a real
    // phone number that has nothing to do with the call.
    assert.equal(e164FromCarrier('sip:1001@pbx.example.com'), '');
  });

  test('refuses anything too short to be a phone number', () => {
    assert.equal(e164FromCarrier('101'), '');
    assert.equal(e164FromCarrier(''), '');
    assert.equal(e164FromCarrier(undefined), '');
    assert.equal(e164FromCarrier(null), '');
  });
});
