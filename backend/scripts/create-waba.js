/**
 * Create (or list existing) WhatsApp Business Accounts under your Meta Business ID.
 *
 * Run:
 *   node --env-file=.env scripts/create-waba.js
 *
 * Requires in .env:
 *   META_BUSINESS_ID          — your Meta Business Manager ID
 *   META_SYSTEM_USER_TOKEN    — System User token with whatsapp_business_management permission
 *   META_API_VERSION          — optional, defaults to v19.0
 */

const {
  META_BUSINESS_ID,
  META_SYSTEM_USER_TOKEN,
  META_API_VERSION = 'v19.0',
} = process.env;

if (!META_BUSINESS_ID || !META_SYSTEM_USER_TOKEN) {
  console.error('❌  Set META_BUSINESS_ID and META_SYSTEM_USER_TOKEN in your .env');
  process.exit(1);
}

const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function metaGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${META_SYSTEM_USER_TOKEN}` },
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Meta error ${res.status}`);
  return data;
}

async function metaPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${META_SYSTEM_USER_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`${data.error?.message ?? `Meta error ${res.status}`}\n${JSON.stringify(data.error ?? data, null, 2)}`);
  }
  return data;
}

// ── Step 1: List existing WABAs ───────────────────────────────────────────────
console.log(`\n🔍  Checking existing WABAs under Business ID: ${META_BUSINESS_ID}\n`);

let existing = [];
try {
  const resp = await metaGet(`/${META_BUSINESS_ID}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id,message_template_namespace`);
  existing = resp.data ?? [];
} catch (err) {
  console.warn('⚠️  Could not list owned WABAs:', err.message);
}

if (existing.length > 0) {
  console.log(`✅  Found ${existing.length} existing WABA(s):\n`);
  for (const waba of existing) {
    console.log(`  • Name    : ${waba.name}`);
    console.log(`    WABA ID : ${waba.id}`);
    console.log(`    Currency: ${waba.currency}  |  Timezone: ${waba.timezone_id}`);
    console.log('');
  }
  console.log('👉  Copy the WABA ID above and set it as:');
  console.log('    WHATSAPP_BUSINESS_ACCOUNT_ID=<waba-id>  in your .env\n');
  process.exit(0);
}

// ── Step 2: No WABA found — create one ───────────────────────────────────────
console.log('ℹ️   No existing WABA found. Creating a new one…\n');

// Fetch business name to use as WABA name
let bizName = 'My WhatsApp Business';
try {
  const biz = await metaGet(`/${META_BUSINESS_ID}?fields=name`);
  if (biz.name) bizName = biz.name;
} catch { /* use default */ }

console.log(`  Business name : ${bizName}`);
console.log(`  Currency      : USD`);
console.log(`  Timezone      : 1 (America/New_York — change if needed)\n`);

try {
  const result = await metaPost(`/${META_BUSINESS_ID}/whatsapp_business_accounts`, {
    name: bizName,
    currency: 'USD',
    timezone_id: '1',
  });

  console.log('✅  WABA created successfully!\n');
  console.log(`  WABA ID : ${result.id}`);
  console.log(`  Name    : ${result.name ?? bizName}`);
  console.log('');
  console.log('👉  Add this to your .env:');
  console.log(`    WHATSAPP_BUSINESS_ACCOUNT_ID=${result.id}`);
  console.log(`    WHATSAPP_ACCESS_TOKEN=${META_SYSTEM_USER_TOKEN}\n`);
  console.log('Then run:  node --env-file=.env scripts/sync-twilio.js\n');

} catch (err) {
  console.error('❌  WABA creation failed:', err.message);
  console.log('\n💡  If you get a permission error, make sure your System User token has:');
  console.log('    • whatsapp_business_management');
  console.log('    • business_management');
  console.log('\n    Or create the WABA manually in Meta Business Manager →');
  console.log('    Settings → WhatsApp Accounts → Add and copy the ID.\n');
  process.exit(1);
}
