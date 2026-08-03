// backend/src/services/__tests__/personaName.test.js
/**
 * The name the agent SPEAKS when it introduces itself.
 *
 * Regression cover for the reported bug: the onboarding generator names agents
 * "<Name> - <Role>" ("Purva - Hospital Receptionist"), which failed the
 * single-word persona test, so every such agent fell through to a derived name
 * and introduced itself as a stranger — and because the old hash clustered, it
 * was usually the SAME stranger ("Sana") across unrelated accounts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPersonaName,
  agentNameIsPersona,
  personaNameFromLabel,
} from '../agentRuntime.service.js';

const agent = (over = {}) => ({ id: 'cms0r0843000dyhcdf3inn14x', name: 'Test', voice: 'Sarvam - simran (female)', settings: null, ...over });

describe('personaNameFromLabel', () => {
  it('takes the leading name out of a "<Name> - <Role>" label', () => {
    assert.equal(personaNameFromLabel('Purva - Hospital Receptionist'), 'Purva');
    assert.equal(personaNameFromLabel('Riya: Sales Agent'), 'Riya');
    assert.equal(personaNameFromLabel('Arjun | Collections'), 'Arjun');
    assert.equal(personaNameFromLabel('Meera, Front Desk'), 'Meera');
  });

  it('does NOT split a plain multi-word campaign label', () => {
    // Splitting these would make the agent introduce itself as "Real"/"School".
    assert.equal(personaNameFromLabel('Real Estate Lead Qualification'), null);
    assert.equal(personaNameFromLabel('school admissions'), null);
    assert.equal(personaNameFromLabel('Hospital Appointment Booking'), null);
  });

  it('rejects a role word even when it leads a separated label', () => {
    assert.equal(personaNameFromLabel('Receptionist - City Medical'), null);
    assert.equal(personaNameFromLabel('Support - Billing'), null);
  });

  it('rejects junk', () => {
    assert.equal(personaNameFromLabel(''), null);
    assert.equal(personaNameFromLabel('😅😅😅'), null);
    assert.equal(personaNameFromLabel(null), null);
  });
});

describe('getPersonaName', () => {
  it('speaks the stored personaName above everything else', () => {
    // Authoritative: it is the same name the generator wrote into the greeting.
    const a = agent({ name: 'Cold Calling Leads', settings: JSON.stringify({ personaName: 'Purva' }) });
    assert.equal(getPersonaName(a), 'Purva');
  });

  it('speaks the leading name of a "<Name> - <Role>" agent (the reported bug)', () => {
    assert.equal(getPersonaName(agent({ name: 'Purva - Hospital Receptionist' })), 'Purva');
  });

  it('speaks a bare human agent name as-is', () => {
    assert.equal(getPersonaName(agent({ name: 'Riley' })), 'Riley');
  });

  it('ignores a junk stored personaName and falls back', () => {
    const a = agent({ name: 'Purva - Hospital Receptionist', settings: JSON.stringify({ personaName: '[Agent Name]' }) });
    assert.equal(getPersonaName(a), 'Purva');
  });

  it('survives malformed settings JSON', () => {
    assert.equal(getPersonaName(agent({ name: 'Purva - Reception', settings: '{not json' })), 'Purva');
  });

  it('derives a name only for a genuine campaign label', () => {
    const name = getPersonaName(agent({ name: 'Cold Calling Leads' }));
    assert.match(name, /^[A-Z][a-z]+$/);
  });

  it('is stable for the same agent and gender-matched to the voice', () => {
    const a = agent({ name: 'Cold Calling Leads', voice: 'Sarvam - aditya (male)' });
    const first = getPersonaName(a);
    assert.equal(first, getPersonaName(a));
    assert.ok(['Arjun', 'Rohan', 'Aditya', 'Karan', 'Vikram', 'Rahul', 'Dev', 'Nikhil'].includes(first), `${first} should be a male name`);
  });

  it('spreads derived names across the pool instead of clustering', () => {
    // The old hash mixed the low bits poorly and `% 8` reads only those, so
    // unrelated cuids (which share a timestamp prefix) collapsed onto one name.
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      seen.add(getPersonaName(agent({ id: `cms0r084300${i.toString().padStart(4, '0')}yhcdf3inn14x`, name: 'Cold Calling Leads' })));
    }
    assert.ok(seen.size >= 6, `expected a spread of names, got ${seen.size}: ${[...seen]}`);
    assert.ok(![...seen].includes(undefined), 'a negative modulo must never index off the pool');
  });

  it('never returns undefined for any id', () => {
    for (let i = 0; i < 200; i++) {
      assert.equal(typeof getPersonaName(agent({ id: `id-${i}`, name: 'Lead Gen Campaign' })), 'string');
    }
  });
});

describe('agentNameIsPersona', () => {
  it('accepts a bare human name and rejects labels/roles/mash', () => {
    assert.equal(agentNameIsPersona({ name: 'Purva' }), true);
    assert.equal(agentNameIsPersona({ name: 'Purva - Hospital Receptionist' }), false);
    assert.equal(agentNameIsPersona({ name: 'Receptionist' }), false);
    assert.equal(agentNameIsPersona({ name: 'bcdfghjklm' }), false); // no vowel
  });
});
