// Attach a number the MAIN Plivo account already holds to a workspace, without
// deploying anything.
//
// Runs `attachMainAccountNumber()` — the same service function the admin
// endpoint calls — from a local checkout against whatever DATABASE_URL and
// PLIVO_* credentials the environment supplies. That is the point: the feature
// lives in the service layer, so it works before the route or the UI ship.
//
// Dry run by default. It reads from Plivo and the database and tells you what
// it would do; nothing is written until you pass --commit.
//
//   node --env-file=.env scripts/attach-main-account-number.mjs \
//     --workspace <id> --number +912269851741 [--series TRANSACTIONAL_LANDLINE] [--commit]
//
// Needs Node >= 20.6 for --env-file. In the repo's backend/ directory that file
// is the production env on the VPS and your local one here; check which one you
// are pointed at before passing --commit.

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const workspaceId = flag('workspace');
const phoneNumber = flag('number');
const series = flag('series');
const commit = has('commit');

if (!workspaceId || !phoneNumber) {
  console.error(
    'usage: node --env-file=.env scripts/attach-main-account-number.mjs '
    + '--workspace <workspaceId> --number +91XXXXXXXXXX [--series ...] [--commit]',
  );
  process.exit(2);
}

const { default: prisma } = await import('../src/config/prisma.js');

// Which database this is about to touch, with the password stripped. Printed
// rather than assumed: the same command is correct on the VPS and catastrophic
// against the wrong DATABASE_URL, and the only difference is this string.
const dbLabel = String(process.env.DATABASE_URL ?? '')
  .replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')
  .replace(/\?.*$/, '');
console.log(`database: ${dbLabel || '(DATABASE_URL not set)'}`);

const workspace = await prisma.workspace.findUnique({
  where: { id: workspaceId },
  select: { id: true, name: true, slug: true },
});
if (!workspace) {
  console.error(`No workspace ${workspaceId} in this database.`);
  process.exit(1);
}
console.log(`workspace: ${workspace.name} (${workspace.slug})`);
console.log(`number:    ${phoneNumber}`);

if (!commit) {
  // Everything the real call would refuse over, checked read-only. The carrier
  // read is the valuable half — a number the main account does not hold, or one
  // sitting in a subaccount, is the failure that is silent until a call is made.
  const { mainCredentials, plivoRequest, PlivoError } = await import('../src/services/plivo/client.js');
  const bare = phoneNumber.replace(/^\+/, '');

  const existing = await prisma.voiceNumber.findUnique({
    where: { phoneNumber },
    select: { workspaceId: true, status: true },
  });
  if (existing) {
    console.log(`\nREFUSED: already recorded against workspace ${existing.workspaceId} (${existing.status}).`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const creds = mainCredentials();
  if (!creds) {
    console.log('\nPLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are not set, so the carrier side cannot be checked here.');
  } else {
    try {
      const n = await plivoRequest(`/Number/${bare}/`, { credentials: creds });
      const sub = n?.sub_account ?? null;
      console.log(`\ncarrier:   held by ${sub ? `SUBACCOUNT ${sub}` : 'the main account'}`);
      console.log(`voice app: ${n?.app_id ?? '(none — inbound would not reach this platform)'}`);
      if (sub) console.log('REFUSED: a subaccount number cannot be lent from the main account.');
    } catch (err) {
      if (err instanceof PlivoError && err.status === 404) {
        console.log('\nREFUSED: the main Plivo account does not hold this number. Buy it in the console first.');
      } else {
        console.log(`\nCould not read the number from Plivo: ${err.message}`);
      }
    }
  }

  console.log('\nDry run — nothing was written. Re-run with --commit to attach it.');
  await prisma.$disconnect();
  process.exit(0);
}

const { attachMainAccountNumber } = await import('../src/services/plivo/number.service.js');
const result = await attachMainAccountNumber(workspaceId, { phoneNumber, series });

if (!result.ok) {
  console.error(`\nFAILED: ${result.error}`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log('\nAttached.');
console.log(`  id          ${result.number.id}`);
console.log(`  series      ${result.number.series}`);
console.log(`  subaccount  ${result.number.subaccountId ?? 'none (dialled on the main account)'}`);
if (result.voiceApp?.attached) {
  console.log(`  voice app   pointed at ${result.voiceApp.after} (was ${result.voiceApp.before ?? 'none'})`);
}
console.log('\nThe client picks the inbound agent themselves on their Phone numbers page.');

await prisma.$disconnect();
