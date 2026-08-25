#!/usr/bin/env node
/**
 * Answer, against the live Plivo account, the questions the number-provisioning
 * code has had to guess at.
 *
 *     npm run plivo:check
 *
 * Run it WHERE THE CREDENTIALS ARE. The dev box holds no PLIVO_* keys, so this
 * is a VPS command (or a local one after pasting the keys into backend/.env).
 *
 * Everything here is READ-ONLY. It never rents, releases, or files anything —
 * renting spends real money and files a compliance record against a real
 * business, neither of which belongs in a diagnostic.
 *
 * The question it exists for is NUMBER_PURCHASE_MARKETPLACE.md §8.1: **is
 * Indian number purchase API-enabled for resellers, or console-only?** Plivo's
 * India rollout was announced entirely in terms of the console. If search
 * returns inventory here, the API path is real and phase C works as written. If
 * it 4xxs, `rentNumber()` is a wrapper around a manual step and the client-side
 * picker (phase E) needs rethinking before it is built.
 *
 * It also pins the response SHAPES that services/plivo/*.js currently infer.
 */

const HOST = 'https://api.plivo.com';

const authId = process.env.PLIVO_AUTH_ID;
const authToken = process.env.PLIVO_AUTH_TOKEN;

if (!authId || !authToken) {
  console.error('PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are not set.');
  console.error('This must run where the credentials live — the VPS, or locally with them in backend/.env.');
  process.exit(2);
}

const auth = `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`;

const call = async (path, query = {}) => {
  const qs = Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
  const url = `${HOST}/v1/Account/${authId}${path}${qs}`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body, url };
};

const h = (title) => console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : typeof o);

let apiPurchaseLooksAvailable = null;

// ── 1. Who are we? ──────────────────────────────────────────────────────────
h('1. Account');
{
  const r = await call('/');
  if (!r.ok) {
    console.error(`  ✗ ${r.status} — credentials rejected. Nothing else can be trusted.`);
    console.error(`    ${JSON.stringify(r.body).slice(0, 300)}`);
    process.exit(1);
  }
  const a = r.body;
  console.log(`  name         ${a.name ?? '?'}`);
  console.log(`  auth_id      ${a.auth_id ?? authId}`);
  console.log(`  cash_credits ${a.cash_credits ?? '?'}`);
  // The tier decides whether reseller entitlements apply at all. A free-trial
  // account cannot be sold from, whatever the code does.
  console.log(`  address/tier ${a.city ?? '?'} ${a.state ?? ''} ${a.country ?? ''}`.trimEnd());
  console.log(`  (all fields: ${keysOf(a)})`);
}

// ── 2. Subaccounts ──────────────────────────────────────────────────────────
h('2. Subaccounts (phase 2 — reputation isolation, one per workspace)');
{
  const r = await call('/Subaccount/', { limit: '20' });
  if (!r.ok) console.log(`  ✗ ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  else {
    const rows = r.body.objects ?? [];
    console.log(`  ${rows.length} subaccount(s), total_count=${r.body.meta?.total_count ?? '?'}`);
    for (const s of rows.slice(0, 10)) {
      console.log(`    ${s.auth_id}  enabled=${s.enabled}  ${s.name}`);
    }
  }
}

// ── 3. Compliance requirements (phase A) ────────────────────────────────────
h('3. Compliance requirements — IN / local / business');
{
  const r = await call('/PhoneNumber/Compliance/Requirements', {
    country_iso: 'IN', number_type: 'local', user_type: 'business',
  });
  if (!r.ok) {
    console.log(`  ✗ ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    console.log('    → plivo/compliance.service.js#getRequirements will fail here.');
  } else {
    console.log(`  top-level keys: ${keysOf(r.body)}`);
    // matchRequirementsToDocuments() accepts the array under any of these.
    const list = r.body.document_types ?? r.body.documents ?? r.body.requirements
      ?? (Array.isArray(r.body) ? r.body : []);
    console.log(`  ${list.length} document type(s):`);
    for (const d of list) {
      console.log(`    id=${d.document_type_id ?? d.id ?? '(none)'}`);
      console.log(`      name         ${d.document_name ?? d.name ?? '?'}`);
      console.log(`      data_fields  ${JSON.stringify(d.data_fields ?? d.fields ?? [])}`);
      console.log(`      keys         ${keysOf(d)}`);
    }
    console.log('\n  ⚠ Compare against matchRequirementsToDocuments(): it identifies the GST');
    console.log('    type by the word "gst" and the registration type by "incorporat|registration');
    console.log('    certificate|udyam|mca", falling back to whichever declares business_name.');
  }
}

// ── 4. Existing compliance applications ─────────────────────────────────────
h('4. Compliance applications on this account');
{
  const r = await call('/PhoneNumber/Compliance/', { limit: '20' });
  if (!r.ok) console.log(`  ✗ ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  else {
    const rows = r.body.objects ?? r.body.compliance_applications ?? [];
    console.log(`  ${rows.length} application(s)`);
    for (const a of rows.slice(0, 10)) {
      console.log(`    ${a.compliance_application_id ?? a.compliance_id ?? a.id}  ${a.status}  ${a.alias ?? ''}`);
    }
    if (rows[0]) console.log(`  (fields: ${keysOf(rows[0])})`);
  }
}

// ── 5. THE question: is India search/purchase API-enabled? ──────────────────
h('5. Number SEARCH — the §8.1 question');
for (const [label, query] of [
  ['landline (transactional)', { country_iso: 'IN', type: 'local', services: 'voice', limit: '5' }],
  ['140 series (promotional)', { country_iso: 'IN', type: 'local', pattern: '140', services: 'voice', limit: '5' }],
]) {
  const r = await call('/PhoneNumber/', query);
  console.log(`\n  ${label}: ${r.ok ? 'OK' : `✗ ${r.status}`}`);
  if (!r.ok) {
    console.log(`    ${JSON.stringify(r.body).slice(0, 300)}`);
    if (apiPurchaseLooksAvailable === null) apiPurchaseLooksAvailable = false;
    continue;
  }
  apiPurchaseLooksAvailable = apiPurchaseLooksAvailable !== false;
  const rows = r.body.objects ?? [];
  console.log(`    ${rows.length} result(s), total_count=${r.body.meta?.total_count ?? '?'}`);
  if (rows[0]) {
    console.log(`    first: ${JSON.stringify(rows[0])}`);
    console.log(`    → normalizeSearchResult() reads: number, city, region, type,`);
    console.log(`      monthly_rental_rate, voice_enabled. Present? ${
      ['number', 'city', 'region', 'type', 'monthly_rental_rate', 'voice_enabled']
        .filter((k) => !(k in rows[0])).join(', ') || 'all present'}`);
  } else {
    console.log('    (no inventory returned — could be genuinely none, or a gated account)');
  }
}

// ── 6. Numbers we already hold ──────────────────────────────────────────────
h('6. Numbers already on the account');
{
  const r = await call('/Number/', { limit: '20' });
  if (!r.ok) console.log(`  ✗ ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  else {
    const rows = r.body.objects ?? [];
    console.log(`  ${rows.length} number(s)`);
    for (const n of rows) {
      console.log(`    ${n.number}  sub=${n.sub_account ?? '-'}  app=${n.application ?? '-'}  alias=${n.alias ?? '-'}`);
      console.log(`      compliance=${n.compliance_status ?? n.compliance_application_id ?? '-'}  rental=${n.monthly_rental_rate ?? '?'}`);
    }
    if (rows[0]) console.log(`  (fields: ${keysOf(rows[0])})`);
  }
}

// ── Verdict ─────────────────────────────────────────────────────────────────
h('Verdict');
if (apiPurchaseLooksAvailable) {
  console.log('  Search works over the API, so the inventory half of phase C is real.');
  console.log('  It does NOT prove the BUY call works — only an actual rent does, and that');
  console.log('  spends money, so it is deliberately not attempted here. Rent one number by');
  console.log('  hand through POST /compliance/numbers/rent as the first live test.');
} else {
  console.log('  Search did not work. Before concluding the API is gated, check: is the');
  console.log('  account KYC-approved for India, is it in the India data region, and does it');
  console.log('  have an accepted compliance application? All three gate inventory.');
  console.log('  If those are fine, this is §8.1 answered NO — number purchase is console-only,');
  console.log('  rentNumber() becomes a wrapper on a manual step, and phase E needs rethinking.');
}
console.log('');
