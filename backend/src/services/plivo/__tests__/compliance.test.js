// backend/src/services/plivo/__tests__/compliance.test.js
//
// The compliance application is filed once per end customer and reviewed by a
// human at Plivo over several days. Every mistake in here is therefore not a
// stack trace but a rejection that costs the client a week — so the tests
// concentrate on the two places a wrong value is silent:
//
//   1. matchRequirementsToDocuments() — sending the GST certificate as the
//      registration certificate is accepted by the API and rejected days later.
//   2. buildComplianceForm() — `documents[i].file` must line up with position
//      `i` of the JSON `documents` array, or the same swap happens in the
//      multipart body instead.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), 'plivo-compliance-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const {
  buildComplianceForm,
  buildEndUser,
  businessNameWarnings,
  complianceCallbackUrl,
  matchRequirementsToDocuments,
  normalizeBusinessName,
  numberTypeForUseCase,
  parseAddress,
} = await import('../compliance.service.js');

const {
  CARRIER_APPLICATION_STATUS,
  DOCUMENT_KIND,
  PLIVO_COMPLIANCE_STATUS,
  PLIVO_COMPLIANCE_STATUS_MAP,
  PLIVO_NUMBER_TYPE,
  PLIVO_REVOKING_STATUSES,
  USE_CASE,
} = await import('../../../constants/compliance.js');

// ── Fixtures ────────────────────────────────────────────────────────────────

const doc = (kind, fileName, storageKey) => ({
  kind, fileName, storageKey, mimeType: 'application/pdf', sizeBytes: 1024,
});

const COI = doc(DOCUMENT_KIND.COI, 'incorporation.pdf', 'stored-coi.pdf');
const GST = doc(DOCUMENT_KIND.GST, 'gst-reg-06.pdf', 'stored-gst.pdf');

/** Shaped like Plivo's Requirements response for IN / local / business. */
const REQUIREMENTS = {
  document_types: [
    {
      document_type_id: 'uuid-registration',
      name: 'Business Registration Certificate',
      description: 'MCA Certificate of Incorporation or Udyam registration',
      data_fields: ['business_name'],
    },
    {
      document_type_id: 'uuid-gst',
      name: 'GST Registration Certificate',
      description: 'Form GST REG-06',
      data_fields: [],
    },
  ],
};

const RECORD = {
  id: 'cmp1',
  workspaceId: 'ws123',
  entityName: 'Acme Dental Pvt. Ltd.',
  contactEmail: 'ops@acmedental.in',
  registrationNumber: 'U72200KA2020PTC123456',
  registeredAddress: JSON.stringify({
    addressLine1: '123 MG Road', city: 'Bangalore', state: 'Karnataka', postalCode: '560001', country: 'IN',
  }),
};

before(async () => {
  await writeFile(path.join(UPLOAD_DIR, 'stored-coi.pdf'), 'COI-BYTES');
  await writeFile(path.join(UPLOAD_DIR, 'stored-gst.pdf'), 'GST-BYTES');
});

after(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

// ── Requirement matching ────────────────────────────────────────────────────

describe('matchRequirementsToDocuments', () => {
  test('maps the registration certificate and GST to the right document types', () => {
    const { matched, unmatched } = matchRequirementsToDocuments(REQUIREMENTS, [COI, GST]);
    assert.equal(unmatched.length, 0);
    assert.deepEqual(
      matched.map((m) => [m.documentTypeId, m.kind]),
      [['uuid-registration', DOCUMENT_KIND.COI], ['uuid-gst', DOCUMENT_KIND.GST]],
    );
  });

  test('accepts Udyam in place of a Certificate of Incorporation', () => {
    const udyam = doc(DOCUMENT_KIND.UDYAM, 'udyam.pdf', 'stored-coi.pdf');
    const { matched } = matchRequirementsToDocuments(REQUIREMENTS, [udyam, GST]);
    assert.equal(matched.find((m) => m.documentTypeId === 'uuid-registration').kind, DOCUMENT_KIND.UDYAM);
  });

  test('falls back to the business_name data field when Plivo rewords the labels', () => {
    // The structural signal has to survive a label change: for IN/local/business
    // the registration certificate is the type that asks for business_name and
    // the GST one is the type that asks for nothing.
    const reworded = {
      document_types: [
        { document_type_id: 'uuid-a', name: 'Entity proof', data_fields: ['business_name'] },
        { document_type_id: 'uuid-b', name: 'Tax proof', data_fields: [] },
      ],
    };
    const { matched, unmatched } = matchRequirementsToDocuments(reworded, [COI, GST]);
    assert.equal(matched.length, 1, 'only the business_name one is safely identifiable');
    assert.equal(matched[0].kind, DOCUMENT_KIND.COI);
    assert.equal(unmatched.length, 1, 'the unidentifiable one must be reported, never guessed');
  });

  test('reports rather than guesses when a required document was never uploaded', () => {
    const { matched, unmatched } = matchRequirementsToDocuments(REQUIREMENTS, [COI]);
    assert.equal(matched.length, 1);
    assert.equal(unmatched.length, 1);
    assert.match(unmatched[0].reason, /no uploaded document matches/);
  });

  test('never substitutes GST for the registration certificate', () => {
    // The failure this whole function exists to prevent.
    const { matched, unmatched } = matchRequirementsToDocuments(REQUIREMENTS, [GST]);
    assert.equal(unmatched.length, 1);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].kind, DOCUMENT_KIND.GST);
    assert.equal(matched[0].documentTypeId, 'uuid-gst');
  });

  test('tolerates the response shape being an array or hung off another key', () => {
    const asArray = REQUIREMENTS.document_types;
    assert.equal(matchRequirementsToDocuments(asArray, [COI, GST]).matched.length, 2);
    assert.equal(
      matchRequirementsToDocuments({ requirements: asArray }, [COI, GST]).matched.length,
      2,
    );
  });

  test('reports a requirement carrying no document_type_id', () => {
    const broken = { document_types: [{ name: 'GST Registration Certificate' }] };
    const { unmatched } = matchRequirementsToDocuments(broken, [GST]);
    assert.match(unmatched[0].reason, /no document_type_id/);
  });
});

// ── Multipart assembly ──────────────────────────────────────────────────────

describe('buildComplianceForm', () => {
  const matched = () => matchRequirementsToDocuments(REQUIREMENTS, [COI, GST]).matched;

  test('indexes each file to its own position in the documents array', async () => {
    const { form, data } = await buildComplianceForm({
      record: RECORD, matched: matched(), numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
    });

    assert.deepEqual(
      data.documents.map((d) => d.document_type_id),
      ['uuid-registration', 'uuid-gst'],
    );

    // The file at documents[0].file must be the one data.documents[0] describes.
    const first = form.get('documents[0].file');
    const second = form.get('documents[1].file');
    assert.equal(await first.text(), 'COI-BYTES');
    assert.equal(await second.text(), 'GST-BYTES');
    assert.equal(first.name ?? form.get('documents[0].file').name, 'incorporation.pdf');
  });

  test('sends business_name only on the requirement that asked for it', async () => {
    const { data } = await buildComplianceForm({
      record: RECORD, matched: matched(), numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
    });
    assert.deepEqual(data.documents[0].data_fields, { business_name: 'Acme Dental Pvt. Ltd.' });
    assert.equal(data.documents[1].data_fields, undefined, 'an unexpected key is a validation error, not an ignored extra');
  });

  test('sends the entity name verbatim, not normalized', async () => {
    // Plivo matches it character by character against the certificate, so any
    // tidying we do here is a rejection.
    const { data } = await buildComplianceForm({
      record: { ...RECORD, entityName: 'Acme  Dental Pvt Ltd' },
      matched: matched(), numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
    });
    assert.equal(data.end_user.name, 'Acme  Dental Pvt Ltd');
    assert.equal(data.documents[0].data_fields.business_name, 'Acme  Dental Pvt Ltd');
  });

  test('the alias carries the workspace id and stays inside Plivos 99-char cap', async () => {
    const { data } = await buildComplianceForm({
      record: { ...RECORD, entityName: 'X'.repeat(200) },
      matched: matched(), numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
    });
    assert.ok(data.alias.startsWith('ws_ws123 '));
    assert.ok(data.alias.length <= 99, `alias was ${data.alias.length} chars`);
  });

  test('a JSON data part is sent as one field, not spread across the form', async () => {
    const { form } = await buildComplianceForm({
      record: RECORD, matched: matched(), numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
    });
    const parsed = JSON.parse(form.get('data'));
    assert.equal(parsed.country_iso, 'IN');
    assert.equal(parsed.number_type, 'local');
  });

  test('refuses a document whose bytes are gone rather than filing without it', async () => {
    const ghost = { ...matched()[0], document: doc(DOCUMENT_KIND.COI, 'gone.pdf', 'not-on-disk.pdf') };
    await assert.rejects(
      () => buildComplianceForm({
        record: RECORD, matched: [ghost], numberType: PLIVO_NUMBER_TYPE.LOCAL, includeCallback: false,
      }),
      /re-upload it/,
    );
  });
});

// ── end_user payload ────────────────────────────────────────────────────────

describe('buildEndUser', () => {
  test('emits FLAT address fields, not a nested address object', () => {
    // PLIVO_INTEGRATION.md §4 originally drafted `contact_email` and a nested
    // `street_address`. Both are wrong; this pins the corrected shape.
    const user = buildEndUser(RECORD);
    assert.deepEqual(user, {
      name: 'Acme Dental Pvt. Ltd.',
      type: 'business',
      email: 'ops@acmedental.in',
      registration_number: 'U72200KA2020PTC123456',
      address_line1: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      postal_code: '560001',
      country: 'IN',
    });
  });

  test('defaults country to IN when the address omits it', () => {
    const user = buildEndUser({ ...RECORD, registeredAddress: JSON.stringify({ city: 'Pune' }) });
    assert.equal(user.country, 'IN');
  });
});

describe('parseAddress', () => {
  test('treats null, empty and corrupt JSON alike as not-filled-in', () => {
    assert.deepEqual(parseAddress(null), {});
    assert.deepEqual(parseAddress(''), {});
    assert.deepEqual(parseAddress('{oops'), {});
    assert.deepEqual(parseAddress('"a string"'), {});
  });
});

// ── Name guidance ───────────────────────────────────────────────────────────

describe('business name handling', () => {
  test('normalizeBusinessName only ever compares, never rewrites for the wire', () => {
    assert.equal(normalizeBusinessName('Acme  Dental Pvt. Ltd.'), 'acme dental pvt ltd');
    assert.equal(
      normalizeBusinessName('ACME DENTAL PVT LTD'),
      normalizeBusinessName('Acme Dental Pvt. Ltd.'),
    );
  });

  test('warns about the punctuation mismatch that causes most rejections', () => {
    const warnings = businessNameWarnings('Acme Dental Pvt Ltd');
    assert.ok(warnings.some((w) => /Pvt\. Ltd\./.test(w)));
  });

  test('warns about stray whitespace', () => {
    assert.ok(businessNameWarnings(' Acme Dental ').some((w) => /leading or trailing/.test(w)));
    assert.ok(businessNameWarnings('Acme  Dental').some((w) => /double space/.test(w)));
  });

  test('is advisory only — a clean name produces no warnings', () => {
    assert.deepEqual(businessNameWarnings('Acme Dental Private Limited'), []);
  });
});

// ── Status mapping ──────────────────────────────────────────────────────────

describe('Plivo compliance status mapping', () => {
  test('draft and submitted are both still "under review" to us', () => {
    assert.equal(PLIVO_COMPLIANCE_STATUS_MAP.draft, CARRIER_APPLICATION_STATUS.SUBMITTED);
    assert.equal(PLIVO_COMPLIANCE_STATUS_MAP.submitted, CARRIER_APPLICATION_STATUS.SUBMITTED);
  });

  test('only "accepted" approves', () => {
    assert.equal(PLIVO_COMPLIANCE_STATUS_MAP.accepted, CARRIER_APPLICATION_STATUS.APPROVED);
    const approving = Object.entries(PLIVO_COMPLIANCE_STATUS_MAP)
      .filter(([, v]) => v === CARRIER_APPLICATION_STATUS.APPROVED)
      .map(([k]) => k);
    assert.deepEqual(approving, ['accepted']);
  });

  test('suspended and expired are revoking, not merely rejected', () => {
    // They withdraw an approval we already had, so numbers linked to the
    // application are live and no longer covered — the workspace must stop.
    for (const status of [PLIVO_COMPLIANCE_STATUS.SUSPENDED, PLIVO_COMPLIANCE_STATUS.EXPIRED]) {
      assert.equal(PLIVO_COMPLIANCE_STATUS_MAP[status], CARRIER_APPLICATION_STATUS.REJECTED);
      assert.ok(PLIVO_REVOKING_STATUSES.includes(status));
    }
    assert.ok(!PLIVO_REVOKING_STATUSES.includes(PLIVO_COMPLIANCE_STATUS.REJECTED));
  });

  test('every Plivo status we know of has a mapping', () => {
    for (const status of Object.values(PLIVO_COMPLIANCE_STATUS)) {
      assert.ok(PLIVO_COMPLIANCE_STATUS_MAP[status], `no mapping for "${status}"`);
    }
  });
});

// ── Config ──────────────────────────────────────────────────────────────────

describe('numberTypeForUseCase', () => {
  test('both Indian use cases resolve to local', () => {
    assert.equal(numberTypeForUseCase(USE_CASE.PROMOTIONAL), PLIVO_NUMBER_TYPE.LOCAL);
    assert.equal(numberTypeForUseCase(USE_CASE.TRANSACTIONAL), PLIVO_NUMBER_TYPE.LOCAL);
  });

  test('an undeclared use case resolves to nothing, so submission is refused', () => {
    assert.equal(numberTypeForUseCase(null), null);
    assert.equal(numberTypeForUseCase('MOBILE'), null);
  });
});

describe('complianceCallbackUrl', () => {
  const saved = { hook: process.env.PLIVO_WEBHOOK_URL, ws: process.env.PUBLIC_BACKEND_WS_URL, http: process.env.PUBLIC_BACKEND_URL };
  after(() => {
    for (const [k, v] of [['PLIVO_WEBHOOK_URL', saved.hook], ['PUBLIC_BACKEND_WS_URL', saved.ws], ['PUBLIC_BACKEND_URL', saved.http]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  test('an explicit PLIVO_WEBHOOK_URL wins, byte for byte', () => {
    // The signature is computed over this exact string, so a derivation that
    // "improves" it (adding or trimming a slash) rejects every callback.
    process.env.PLIVO_WEBHOOK_URL = 'https://api.example.com/api/v1/plivo/compliance/';
    process.env.PUBLIC_BACKEND_URL = 'https://other.example.com';
    assert.equal(complianceCallbackUrl(), 'https://api.example.com/api/v1/plivo/compliance/');
  });

  test('derives from the public base when no explicit URL is set', () => {
    delete process.env.PLIVO_WEBHOOK_URL;
    process.env.PUBLIC_BACKEND_URL = 'https://api.example.com';
    assert.equal(complianceCallbackUrl(), 'https://api.example.com/api/v1/plivo/compliance');
  });

  test('tracks publicHttpBase exactly, and is empty when it is', async () => {
    // Asserted against publicHttpBase() rather than a literal '': it reads
    // PUBLIC_BACKEND_WS_URL from the load-time config snapshot, so a developer
    // .env with a tunnel URL in it cannot be unset from here. What matters is
    // the contract — never a relative URL a carrier could not fetch.
    delete process.env.PLIVO_WEBHOOK_URL;
    delete process.env.PUBLIC_BACKEND_URL;
    const { publicHttpBase } = await import('../../../lib/publicUrl.js');
    const base = publicHttpBase();
    assert.equal(complianceCallbackUrl(), base ? `${base}/api/v1/plivo/compliance` : '');
    assert.ok(!complianceCallbackUrl().startsWith('/'), 'never a relative URL');
  });
});
