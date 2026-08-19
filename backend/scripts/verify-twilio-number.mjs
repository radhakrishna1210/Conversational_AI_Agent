#!/usr/bin/env node
/**
 * Verify a destination number on a Twilio TRIAL account, so test calls can
 * actually reach it.
 *
 *   node --env-file=.env scripts/verify-twilio-number.mjs +919226381481
 *   node --env-file=.env scripts/verify-twilio-number.mjs +919226381481 --delay 20
 *   node --env-file=.env scripts/verify-twilio-number.mjs --list
 *
 * WHY THIS IS NEEDED AT ALL. A Twilio trial account refuses to call any number
 * it has not verified — the call is rejected before it reaches the carrier, so
 * nothing in this codebase ever runs and the failure looks like a bug in the
 * dialer. Every phone you want to receive a test call on has to be verified
 * once. (Upgrading the account removes the restriction entirely; this exists
 * because trials are how you test before deciding to pay.)
 *
 * HOW THE HANDSHAKE WORKS, because it is not a normal API call: the POST below
 * does not verify anything by itself. It returns a six-digit code AND makes
 * Twilio place a real phone call to the number, where a recorded voice asks the
 * person answering to key that code in. Only then does the number appear in the
 * account's verified caller IDs. So this script prints the code first, waits
 * (see --delay) to give you time to reach the handset, and then polls until the
 * verification lands rather than leaving you guessing.
 */
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
if (!SID || !TOKEN) {
  console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set in .env');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}${path}`, {
    ...init,
    headers: { authorization: AUTH, ...(init.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const listVerified = async () => {
  const { body } = await api('/OutgoingCallerIds.json?PageSize=50');
  return body?.outgoing_caller_ids ?? [];
};

const args = process.argv.slice(2);
if (args.includes('--list') || args.length === 0) {
  const ids = await listVerified();
  console.log(`\nverified caller IDs (${ids.length}):`);
  for (const c of ids) console.log(`  ${c.phone_number}  ${c.friendly_name}`);
  if (!args.includes('--list')) console.log('\nusage: node --env-file=.env scripts/verify-twilio-number.mjs +91XXXXXXXXXX\n');
  process.exit(0);
}

const number = args[0];
const delaySec = Number(args[args.indexOf('--delay') + 1]) || 15;

// E.164 or nothing. A malformed number here is not a validation error you get
// to correct — it is an automated phone call placed to whoever does own it.
if (!/^\+[1-9]\d{7,14}$/.test(number)) {
  console.error(`"${number}" is not E.164. It must start with + and the country code, e.g. +919226381481 for an Indian mobile.`);
  process.exit(1);
}

const already = (await listVerified()).find((c) => c.phone_number === number);
if (already) {
  console.log(`\n${number} is already verified (${already.friendly_name}). Nothing to do.\n`);
  process.exit(0);
}

const acct = await api('.json');
console.log(`\naccount ${acct.body?.friendly_name} — ${acct.body?.type}`);
if (acct.body?.type !== 'Trial') {
  console.log('This account is not a trial, so it can already call any number. Verifying is harmless but unnecessary.');
}

console.log(`\nAsking Twilio to verify ${number}...`);
const { status, body } = await api('/OutgoingCallerIds.json', {
  method: 'POST',
  body: new URLSearchParams({
    PhoneNumber: number,
    FriendlyName: 'Test handset (verified via scripts/verify-twilio-number.mjs)',
    // Seconds Twilio waits before dialling. The default is 0, which rings the
    // phone before the code has finished printing — useless if the handset is
    // in another room.
    CallDelay: String(Math.min(Math.max(delaySec, 0), 60)),
  }).toString(),
});

if (status >= 300) {
  console.error(`\nTwilio refused: HTTP ${status}${body?.code ? ` (code ${body.code})` : ''} — ${body?.message || JSON.stringify(body)}`);

  // 10002 on a trial account is not a mistake in the request, and retrying or
  // reformatting the number will never fix it: Twilio blocks the verification
  // API on trials specifically. The CONSOLE flow is not blocked — it is how
  // trial users add their own phone in the first place — so the way forward is
  // a different door, not a different payload.
  if (body?.code === 10002) {
    console.error('\n  This is a trial-account restriction on the API, not a problem with the number.');
    console.error('  The Console flow still works on trials. Add it here:');
    console.error('\n    https://console.twilio.com/us1/develop/phone-numbers/manage/verified\n');
    console.error(`    "Add a new Caller ID" -> ${number} -> choose Call or SMS -> enter the code.`);
    console.error('\n  Then re-run this script with --list to confirm it landed.');
    console.error('\n  Alternative that needs no verification at all: call the Twilio number');
    console.error(`  ${process.env.TWILIO_FROM_NUMBER || '(TWILIO_FROM_NUMBER unset)'} FROM your phone. Trial accounts accept inbound`);
    console.error('  calls to a number you own without verifying the caller — it exercises the');
    console.error('  same modular bridge, just from the inbound side.');
  }
  if (body?.code === 21450) console.error('(that number is already pending verification — wait for the earlier call, or check the console)');
  process.exit(1);
}

console.log('\n  ┌──────────────────────────────────────────────┐');
console.log(`  │   VALIDATION CODE:  ${String(body.validation_code).padEnd(24)} │`);
console.log('  └──────────────────────────────────────────────┘');
console.log(`\nTwilio will call ${number} in about ${delaySec}s. Answer it and key in the code above.\n`);

// Poll rather than exit: "did it work?" is the only question that matters and
// the API will not push the answer.
const deadline = Date.now() + 180_000;
process.stdout.write('waiting for the code to be entered');
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  if ((await listVerified()).some((c) => c.phone_number === number)) {
    console.log(`\n\n✅ ${number} is verified. Twilio test calls can now reach it.\n`);
    process.exit(0);
  }
  process.stdout.write('.');
}
console.log(`\n\nStill not verified after 3 minutes. The call may have been missed — re-run this script to try again.\n`);
process.exit(1);
