import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionalVariables, normalizeRecipient } from '../whatsappPostCall.service.js';
import { WHATSAPP_TEMPLATE_PRESETS, presetVariableCount } from '../../constants/whatsappTemplatePresets.js';
import { deriveTemplateName, buildComponents } from '../whatsappTemplates.service.js';

/** The shape post-call extraction actually produces (postCallExtraction.utils.js). */
const vars = (pairs) => Object.entries(pairs).map(([key, value]) => ({ key, description: '', configIds: [], value, evidence: null }));
const finder = (list) => (key) => list.find((v) => String(v.key).toLowerCase() === String(key ?? '').toLowerCase());

describe('buildPositionalVariables', () => {
  const extracted = vars({ customer_name: 'Priya', appointment_date: '12 September, 4:00 PM' });
  const find = finder(extracted);

  test('maps placeholder indices to a 1-based positional array', () => {
    const out = buildPositionalVariables([
      { placeholderIndex: 1, variableKey: 'customer_name' },
      { placeholderIndex: 2, variableKey: 'appointment_date' },
    ], find);
    assert.equal(out.ok, true);
    // Meta placeholders are 1-based; the wire format is a plain array, so {{1}} is index 0.
    assert.deepEqual(out.values, ['Priya', '12 September, 4:00 PM']);
  });

  test('order of the mapping entries does not matter — the index does', () => {
    const out = buildPositionalVariables([
      { placeholderIndex: 2, variableKey: 'appointment_date' },
      { placeholderIndex: 1, variableKey: 'customer_name' },
    ], find);
    assert.equal(out.ok, true);
    assert.deepEqual(out.values, ['Priya', '12 September, 4:00 PM']);
  });

  test('refuses rather than sending "Hi , your appointment is confirmed for ."', () => {
    const out = buildPositionalVariables([
      { placeholderIndex: 1, variableKey: 'customer_name' },
      { placeholderIndex: 2, variableKey: 'never_extracted' },
    ], find);
    assert.equal(out.ok, false);
    assert.match(out.missing.join(' '), /\{\{2\}\}/);
  });

  test('a variable extracted as whitespace counts as missing', () => {
    const find2 = finder(vars({ customer_name: '   ' }));
    const out = buildPositionalVariables([{ placeholderIndex: 1, variableKey: 'customer_name' }], find2);
    assert.equal(out.ok, false);
  });

  test('a gap in the mapping is an error, not a silent empty parameter', () => {
    // {{1}} unmapped, {{2}} mapped — Meta rejects empty parameters anyway.
    const out = buildPositionalVariables([{ placeholderIndex: 2, variableKey: 'customer_name' }], find);
    assert.equal(out.ok, false);
    assert.match(out.missing.join(' '), /\{\{1\}\}/);
  });

  test('an empty mapping never sends', () => {
    assert.equal(buildPositionalVariables([], find).ok, false);
    assert.equal(buildPositionalVariables(undefined, find).ok, false);
  });

  test('non-string extracted values are stringified, not dropped', () => {
    const find3 = finder(vars({ party_size: 4 }));
    const out = buildPositionalVariables([{ placeholderIndex: 1, variableKey: 'party_size' }], find3);
    assert.equal(out.ok, true);
    assert.deepEqual(out.values, ['4']);
  });
});

describe('normalizeRecipient', () => {
  test('strips the formatting Meta rejects', () => {
    assert.equal(normalizeRecipient('+91 98765 43210'), '919876543210');
    assert.equal(normalizeRecipient('+91-98765-43210'), '919876543210');
  });

  test('refuses what is not a phone number', () => {
    // A web call has no caller number: payload.phoneNumber is '' there.
    assert.equal(normalizeRecipient(''), null);
    assert.equal(normalizeRecipient(null), null);
    assert.equal(normalizeRecipient(undefined), null);
    assert.equal(normalizeRecipient('12345'), null);
    assert.equal(normalizeRecipient('not a number'), null);
  });
});

describe('template presets', () => {
  test('every preset declares exactly as many placeholders as its body uses', () => {
    for (const p of WHATSAPP_TEMPLATE_PRESETS) {
      assert.equal(presetVariableCount(p), p.placeholders.length, `${p.id} placeholder count`);
    }
  });

  test('placeholder indices are 1..n with no gaps', () => {
    for (const p of WHATSAPP_TEMPLATE_PRESETS) {
      const idx = p.placeholders.map((x) => x.index).sort((a, b) => a - b);
      assert.deepEqual(idx, idx.map((_, i) => i + 1), `${p.id} indices`);
    }
  });

  test('every preset carries literal wording around its variables', () => {
    // A body that is mostly bare placeholders gets reclassified by Meta from
    // UTILITY to MARKETING — dearer, and it needs marketing opt-in.
    for (const p of WHATSAPP_TEMPLATE_PRESETS) {
      const literal = p.bodyText.replace(/\{\{\d+\}\}/g, '').trim();
      assert.ok(literal.length > 40, `${p.id} has too little literal text: "${literal}"`);
      assert.equal(p.category, 'UTILITY', `${p.id} category`);
    }
  });
});

describe('deriveTemplateName', () => {
  test('produces a Meta-legal name', () => {
    for (const p of WHATSAPP_TEMPLATE_PRESETS) {
      const name = deriveTemplateName(p.id, 'ckv9x2abc123def456');
      assert.match(name, /^[a-z0-9_]{1,64}$/, `${p.id} -> ${name}`);
    }
  });

  test('is stable for the same workspace and distinct across workspaces', () => {
    const a1 = deriveTemplateName('appointment_confirmation', 'ckv9x2abc123def456');
    const a2 = deriveTemplateName('appointment_confirmation', 'ckv9x2abc123def456');
    const b = deriveTemplateName('appointment_confirmation', 'zzz88y7xwvu654321');
    assert.equal(a1, a2);
    assert.notEqual(a1, b);
  });

  test('survives a workspace id with characters Meta forbids', () => {
    assert.match(deriveTemplateName('booking_confirmation', 'WS-123/456'), /^[a-z0-9_]{1,64}$/);
  });
});

describe('buildComponents', () => {
  test('carries a sample for every placeholder, as Meta requires at submission', () => {
    for (const p of WHATSAPP_TEMPLATE_PRESETS) {
      const [body] = buildComponents(p);
      assert.equal(body.type, 'BODY');
      assert.equal(body.text, p.bodyText);
      // Meta's shape is an array-of-arrays: one row of samples.
      assert.equal(body.example.body_text.length, 1);
      assert.equal(body.example.body_text[0].length, presetVariableCount(p), `${p.id} samples`);
      assert.ok(body.example.body_text[0].every((s) => typeof s === 'string' && s.trim()), `${p.id} sample values`);
    }
  });
});
