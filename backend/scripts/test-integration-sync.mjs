// backend/scripts/test-integration-sync.mjs
//
// Directly exercises the Zoho/Notion post-call push functions
// (pushCallAsLead / createPostCallPage), bypassing the HTTP layer entirely —
// no auth headers, no running server needed. This calls the exact same
// functions deliverPostCall calls after a real call ends, against your real
// stored OAuth tokens, so a success here means the real pipeline will work
// too (and a failure here is the real failure, not a mock standing in for it).
//
// Logs every outbound HTTP request/response the services make (Zoho token
// refresh, Zoho Leads POST, Notion database search, Notion page POST) by
// wrapping the global fetch for the duration of this run — done here rather
// than inside zoho.service.js/notion.service.js so those files don't carry
// permanent debug logging for a one-off test.
//
// Usage:
//   node --env-file=.env scripts/test-integration-sync.mjs <workspaceId> [agentId] [provider]
//
// provider is optional — "zoho" or "notion" runs only that one (skips the
// other's section entirely, no "SKIPPED" noise for it); omitted or "all" runs
// both, same as before. agentId can be passed as "-" to mean "use the default"
// while still specifying a provider, e.g.:
//   node --env-file=.env scripts/test-integration-sync.mjs <workspaceId> - zoho
//
// If agentId is omitted, the most recently created agent in that workspace is
// used. If the workspace has a real AgentCallLog row, its actual transcript/
// extractedData is used as the payload; otherwise a synthetic sample payload
// is used (same shape deliverPostCall builds).
//
// To force which Notion database gets written to (bypassing auto-discovery/
// cache — see resolveTargetDatabaseId in notion.service.js), set
// NOTION_DATABASE_ID either permanently in .env, or just for this run:
//   NOTION_DATABASE_ID=<id> node --env-file=.env scripts/test-integration-sync.mjs <workspaceId>
// (an inline var like that takes precedence over the same key in --env-file)
//
// If Zoho isn't connected (no IntegrationToken row — see the ZOHO section's
// own explanation when that happens), the real fix is reconnecting once
// through the dashboard: Zoho issues a refresh token, and
// zoho.service.js's getValidAccessToken refreshes forever after that with no
// browser involved again — this script does NOT need OAuth repeated per run.
//
// For seeding a REAL token without going through our OAuth redirect at all —
// e.g. from Zoho's own "Self Client" feature (API Console → your app → Self
// Client tab, generates a real grant token with no browser redirect, built by
// Zoho for exactly this server-to-server testing case) — set:
//   ZOHO_ACCESS_TOKEN=<token>            required
//   ZOHO_REFRESH_TOKEN=<token>           optional, but without it re-seeding
//                                        is required every ~time the access
//                                        token expires (~1h)
//   ZOHO_API_DOMAIN=https://www.zohoapis.com   optional, defaults shown
// These are read directly via process.env (not added to config/env.js) since
// they exist only to seed a DB row for this script, not as real app config.
// This is NOT a mock — pushCallAsLead still calls the real Zoho API with
// whatever real token ends up in the DB; nothing in zoho.service.js itself
// gets a fake/bypass branch.

import { env } from '../src/config/env.js';
import prisma from '../src/config/prisma.js';

const [workspaceId, agentIdRaw, providerRaw] = process.argv.slice(2);
const agentIdArg = agentIdRaw && agentIdRaw !== '-' ? agentIdRaw : undefined;
const providerArg = (providerRaw ?? 'all').toLowerCase();

if (!workspaceId) {
  console.error('Usage: node --env-file=.env scripts/test-integration-sync.mjs <workspaceId> [agentId] [provider]');
  process.exit(1);
}
if (!['all', 'zoho', 'notion'].includes(providerArg)) {
  console.error(`Unknown provider "${providerRaw}" — must be "zoho", "notion", or omitted for both.`);
  process.exit(1);
}
const runZoho = providerArg === 'all' || providerArg === 'zoho';
const runNotion = providerArg === 'all' || providerArg === 'notion';

// ── verbose fetch logging ──────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let reqN = 0;
globalThis.fetch = async (url, init = {}) => {
  const n = ++reqN;
  const method = init.method ?? 'GET';
  console.log(`\n[fetch #${n}] → ${method} ${url}`);
  if (init.headers) {
    const headers = { ...init.headers };
    if (headers.Authorization) headers.Authorization = headers.Authorization.slice(0, 20) + '…(redacted)';
    console.log(`[fetch #${n}]   headers:`, headers);
  }
  if (init.body) console.log(`[fetch #${n}]   body:`, String(init.body).slice(0, 1000));

  const res = await realFetch(url, init);
  const clone = res.clone();
  const text = await clone.text().catch(() => '(unreadable body)');
  console.log(`[fetch #${n}] ← ${res.status} ${res.statusText}`);
  console.log(`[fetch #${n}]   response:`, text.slice(0, 1000));
  return res;
};

// ── optional: seed a REAL Zoho token from env, bypassing our OAuth redirect ──
async function maybeSeedZohoFromEnv() {
  if (!runZoho) return;
  const accessToken = process.env.ZOHO_ACCESS_TOKEN;
  if (!accessToken) return;

  const refreshToken = process.env.ZOHO_REFRESH_TOKEN || null;
  const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  console.log(`\nZOHO_ACCESS_TOKEN is set — seeding a real token into the DB for workspace ${workspaceId} (apiDomain=${apiDomain}${refreshToken ? '' : ', NO refresh token given — this will need re-seeding once the access token expires (~1h)'}).`);

  const { encryptToken } = await import('../src/lib/encryption.js');
  const integration = await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: 'zoho' } },
    create: { workspaceId, provider: 'zoho', name: 'Zoho CRM', status: 'connected', connected: true, webhookStatus: 'ready', metadata: JSON.stringify({ apiDomain }) },
    update: { status: 'connected', connected: true, metadata: JSON.stringify({ apiDomain }) },
  });
  await prisma.integrationToken.upsert({
    where: { integrationId: integration.id },
    create: {
      integrationId: integration.id, workspaceId, provider: 'zoho',
      accessTokenCipher: encryptToken(accessToken),
      refreshTokenCipher: refreshToken ? encryptToken(refreshToken) : '',
      tokenType: 'Bearer', scopes: 'ZohoCRM.modules.ALL',
      // Assume the pasted token is fresh; getValidAccessToken re-checks this
      // against real time on every call regardless, same as a normally-issued one.
      expiresAt: new Date(Date.now() + 55 * 60 * 1000),
    },
    update: {
      accessTokenCipher: encryptToken(accessToken),
      ...(refreshToken ? { refreshTokenCipher: encryptToken(refreshToken) } : {}),
      expiresAt: new Date(Date.now() + 55 * 60 * 1000),
      revokedAt: null,
    },
  });
  console.log('Seeded.');
}

// ── load workspace/agent/call context ──────────────────────────────────────
async function loadContext() {
  const agent = agentIdArg
    ? await prisma.agent.findFirst({ where: { id: agentIdArg, workspaceId } })
    : await prisma.agent.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  if (!agent) throw new Error(`No agent found in workspace ${workspaceId}${agentIdArg ? ` with id ${agentIdArg}` : ''}.`);

  const call = await prisma.agentCallLog.findFirst({
    where: { workspaceId, agentId: agent.id, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });

  let payload;
  if (call) {
    const extracted = (() => { try { return JSON.parse(call.extractedData); } catch { return {}; } })();
    const transcript = (() => { try { return JSON.parse(call.transcript); } catch { return []; } })();
    payload = {
      callId: call.id,
      callType: call.type,
      outcome: call.status === 'COMPLETED' ? 'Completed' : call.status,
      durationSec: call.durationSec,
      phoneNumber: call.phoneNumber ?? '',
      variables: Array.isArray(extracted.variables) ? extracted.variables : [],
      transcript: transcript.map((m) => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n'),
      endedAt: (call.endedAt ?? new Date()).toISOString(),
    };
    console.log(`Using REAL call log ${call.id} from this workspace.`);
  } else {
    payload = {
      callId: `test-call-${Date.now()}`,
      callType: 'WEB_CALL',
      outcome: 'Completed',
      durationSec: 42,
      phoneNumber: '+15555550123',
      variables: [{ key: 'customer_name', value: 'Test User', evidence: 'said their name was Test User' }],
      transcript: 'Customer: Hi\nAgent: Hello, how can I help?',
      endedAt: new Date().toISOString(),
    };
    console.log('No COMPLETED call log found in this workspace — using a synthetic sample payload instead.');
  }

  return { agent, payload };
}

async function run() {
  await maybeSeedZohoFromEnv();

  const { agent, payload } = await loadContext();
  console.log(`\nAgent: ${agent.name} (${agent.id})`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  const [zohoIntegration, notionIntegration] = await Promise.all([
    runZoho ? prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: 'zoho' } }, include: { token: true } }) : null,
    runNotion ? prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: 'notion' } }, include: { token: true } }) : null,
  ]);

  if (runZoho) {
    console.log('\n' + '='.repeat(70));
    console.log('ZOHO');
    console.log('='.repeat(70));
    if (!zohoIntegration?.connected) {
      console.log('SKIPPED — Zoho is not connected for this workspace.');
    } else if (!zohoIntegration.token) {
      console.log('SKIPPED — Zoho shows connected but has no stored token.');
      console.log('  Fix: reconnect via the Integrations page (one-time — refresh works automatically after),');
      console.log('  or set ZOHO_ACCESS_TOKEN (see this script\'s header comment) to seed a real token without the browser.');
    } else {
      try {
        const { pushCallAsLead } = await import('../src/services/zoho.service.js');
        const leadId = await pushCallAsLead(workspaceId, agent.id, payload);
        console.log(`\nRESULT: SUCCESS — Zoho Lead ${leadId} created.`);
      } catch (err) {
        console.log(`\nRESULT: FAILED — ${err.message}`);
      }
    }
  }

  if (runNotion) {
    console.log('\n' + '='.repeat(70));
    console.log('NOTION');
    console.log('='.repeat(70));
    if (!notionIntegration?.connected) {
      console.log('SKIPPED — Notion is not connected for this workspace.');
    } else if (!notionIntegration.token) {
      console.log('SKIPPED — Notion shows connected but has no stored token. Reconnect it on the Integrations page.');
    } else {
      // Read back the SAME value createPostCallPage will resolve to: forced
      // NOTION_DATABASE_ID wins if set, else the cached Integration.settingsJson.
      // databaseId, else auto-discovery on this run. Logged here in the script
      // rather than in the service file, so this stays a one-off diagnostic and
      // not permanent debug noise in production code.
      const cachedDatabaseId = (() => { try { return JSON.parse(notionIntegration.settingsJson).databaseId; } catch { return undefined; } })();
      if (env.NOTION_DATABASE_ID) {
        console.log(`\nTarget Notion databaseId: ${env.NOTION_DATABASE_ID}  (forced via NOTION_DATABASE_ID env var — overrides cache${cachedDatabaseId && cachedDatabaseId !== env.NOTION_DATABASE_ID ? `, which was ${cachedDatabaseId}` : ''})`);
      } else if (cachedDatabaseId) {
        console.log(`\nTarget Notion databaseId (cached in Integration.settingsJson): ${cachedDatabaseId}`);
        console.log('If this is still the OLD "Projects" database and not "AI Call Records", set NOTION_DATABASE_ID to force the right one — the cache will NOT auto-switch on its own.');
      } else {
        console.log('\nTarget Notion databaseId: (none cached, no NOTION_DATABASE_ID set — will auto-discover and cache one this run)');
      }

      try {
        const { createPostCallPage } = await import('../src/services/notion.service.js');
        const pageId = await createPostCallPage(workspaceId, agent.id, payload);
        console.log(`\nRESULT: SUCCESS — Notion page ${pageId} created.`);
        console.log('(This is a REAL page in your Notion workspace — archive/delete it manually if it was just a test.)');
      } catch (err) {
        console.log(`\nRESULT: FAILED — ${err.message}`);
      }
    }
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('\nScript crashed:', err);
  process.exit(1);
});
