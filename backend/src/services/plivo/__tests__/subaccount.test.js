// backend/src/services/plivo/__tests__/subaccount.test.js
//
// The two pure pieces of subaccount management, both of which are about finding
// carrier resources nobody is tracking:
//
//   workspaceIdFromSubaccountName  the only link from a Plivo-side subaccount
//                                  back to a workspace when our row is gone.
//   diffSubaccounts                what the carrier audit reports, and the
//                                  reason each class of finding matters.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const { diffSubaccounts, workspaceIdFromSubaccountName } = await import('../subaccount.service.js');

describe('workspaceIdFromSubaccountName', () => {
  test('reads back the workspace id createSubaccount prefixes', () => {
    assert.equal(workspaceIdFromSubaccountName('ws_cm123abc Acme Dental Pvt. Ltd.'), 'cm123abc');
    assert.equal(workspaceIdFromSubaccountName('ws_cm123abc'), 'cm123abc');
  });

  test('returns null for anything not named by us', () => {
    // A subaccount somebody made in the console. It is still an orphan worth
    // reporting; it just cannot be matched to a workspace automatically.
    assert.equal(workspaceIdFromSubaccountName('Han Solo'), null);
    assert.equal(workspaceIdFromSubaccountName(''), null);
    assert.equal(workspaceIdFromSubaccountName(undefined), null);
  });
});

describe('diffSubaccounts', () => {
  const carrier = (authId, name, enabled = true) => ({ authId, name, enabled });
  const row = (authId, workspaceId, enabled = true) => ({ authId, workspaceId, enabled, name: `ws_${workspaceId}` });

  test('matches a subaccount we hold a row for', () => {
    const out = diffSubaccounts([carrier('SA1', 'ws_w1 Acme')], [row('SA1', 'w1')]);
    assert.equal(out.linked.length, 1);
    assert.equal(out.linked[0].workspaceId, 'w1');
    assert.deepEqual(out.orphaned, []);
    assert.deepEqual(out.missingAtCarrier, []);
    assert.deepEqual(out.enabledDrift, []);
  });

  test('reports a subaccount at Plivo we have no row for, and whose workspace it names', () => {
    // This is the orphan class: it may be holding numbers, it is certainly
    // billing, and nothing in the product manages it.
    const out = diffSubaccounts([carrier('SA9', 'ws_w9 Ghost Ltd')], [], new Set(['w9']));
    assert.equal(out.orphaned.length, 1);
    assert.equal(out.orphaned[0].claimedWorkspaceId, 'w9');
    assert.equal(out.orphaned[0].workspaceExists, true, 'a live workspace means this one can be relinked');
  });

  test('marks an orphan whose workspace is gone', () => {
    const out = diffSubaccounts([carrier('SA9', 'ws_deleted Ghost')], [], new Set());
    assert.equal(out.orphaned[0].workspaceExists, false, 'nothing to relink it to — it should be deleted');
  });

  test('reports a row whose subaccount no longer exists at the carrier', () => {
    // Every dial from this workspace will fail on credentials until it is
    // relinked or recreated.
    const out = diffSubaccounts([], [row('SA2', 'w2')]);
    assert.deepEqual(out.missingAtCarrier, [{ authId: 'SA2', workspaceId: 'w2', name: 'ws_w2' }]);
  });

  test('reports a kill switch that says one thing here and another at Plivo', () => {
    const out = diffSubaccounts([carrier('SA3', 'ws_w3', true)], [row('SA3', 'w3', false)]);
    assert.deepEqual(out.enabledDrift, [
      { authId: 'SA3', workspaceId: 'w3', carrierEnabled: true, ourEnabled: false },
    ]);
  });

  test('sorts a mixed account into all four buckets at once', () => {
    const out = diffSubaccounts(
      [carrier('SA1', 'ws_w1'), carrier('SA3', 'ws_w3', false), carrier('SA9', 'ws_w9 Ghost')],
      [row('SA1', 'w1'), row('SA3', 'w3', true), row('SA2', 'w2')],
      new Set(['w9']),
    );
    assert.deepEqual(out.linked.map((l) => l.authId), ['SA1', 'SA3']);
    assert.deepEqual(out.orphaned.map((o) => o.authId), ['SA9']);
    assert.deepEqual(out.missingAtCarrier.map((m) => m.authId), ['SA2']);
    assert.deepEqual(out.enabledDrift.map((d) => d.authId), ['SA3']);
  });
});
