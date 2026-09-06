// backend/src/services/zoho.service.js
/**
 * Zoho CRM token access for a connected workspace integration.
 *
 * Mirrors googleCalendar.service.js's getValidAccessToken: decrypt-and-return
 * if the stored access token is still fresh, transparently refresh it against
 * Zoho's accounts server if not. Zoho access tokens live ~1h, same order of
 * magnitude as Google's, so the same skew-guarded refresh shape applies.
 *
 * Three Zoho-specific things this does that Google's version doesn't:
 *   - Reads/writes metadata.apiDomain: Zoho's CRM API lives on a different
 *     host per data center (accounts.zoho.com vs .eu vs .in etc.), returned
 *     by the accounts server on both the initial connect (see
 *     completeOAuthCallback in integrations.service.js) and on refresh.
 *   - Sends the Authorization header as `Zoho-oauthtoken <token>`, not the
 *     `Bearer <token>` every other provider in this codebase uses — that's
 *     Zoho CRM API's own requirement, not a typo.
 *   - Resolves client_id/client_secret per workspace (settingsJson first,
 *     platform env second) rather than assuming every workspace shares one
 *     OAuth app — see resolveZohoCredentials().
 *
 * Every Leads/Notes call below goes through zohoRequest(), which resolves
 * this workspace's own token fresh on every call and reactively refreshes
 * and retries once if Zoho rejects it — see that function's doc comment.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';
import { addLog } from './integrations.service.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

/** Access tokens live ~1h; refresh a little early to avoid edge-of-expiry races. */
const EXPIRY_SKEW_MS = 60_000;

const notConnected = () =>
  Object.assign(new Error('Zoho CRM is not connected for this workspace — connect it on the Integrations page.'), { statusCode: 400 });

/**
 * This workspace's own Zoho OAuth app, if it registered one (bring-your-own
 * Zoho Developer Console app — see saveIntegrationSettings in
 * integrations.service.js, which is where a plaintext clientSecret submitted
 * through the settings form gets encrypted into clientSecretCipher). Falls
 * back to the platform-wide env app, which is what every connection made
 * before this existed still uses.
 *
 * This has to be resolved on every refresh, not just at connect time:
 * refreshing a token must present the SAME client_id/secret that were used
 * to obtain it. Presenting the platform app's credentials for a token that
 * was actually issued under a workspace's own app is exactly what produces
 * Zoho's "invalid_client" on refresh — the error this whole path exists to
 * stop happening again.
 */
function resolveZohoCredentials(settings) {
  const clientId = (settings.clientId && String(settings.clientId).trim()) || env.ZOHO_CLIENT_ID || '';
  let clientSecret = env.ZOHO_CLIENT_SECRET || '';
  if (settings.clientSecretCipher) {
    try { clientSecret = decryptToken(settings.clientSecretCipher); } catch { /* fall back to the env app */ }
  }
  return { clientId, clientSecret };
}

/**
 * Return { accessToken, apiDomain } for the workspace's Zoho integration,
 * transparently refreshing an expired access token.
 *
 * @param {string} workspaceId
 * @param {{ forceRefresh?: boolean }} [opts] forceRefresh skips the
 *   expiry-based skip check and always goes through the refresh branch —
 *   used by zohoRequest() when Zoho itself rejects a token that still looks
 *   unexpired on our side (revoked externally, clock drift, org admin reset
 *   it). Requires a stored refresh token either way; there is no "force" for
 *   a workspace with nothing to refresh from.
 */
export async function getValidAccessToken(workspaceId, { forceRefresh = false } = {}) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'zoho' } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected();

  const { token } = integration;
  const metadata = safeJson(integration.metadata, {});
  // This workspace's own settings — datacenter (accountsBase) and, now, its
  // own OAuth app credentials if it has one. Never the platform env alone:
  // two workspaces can be on different Zoho datacenters, and (since this
  // refactor) different Zoho apps entirely.
  const settings = safeJson(integration.settingsJson, {});
  const stillValid = !forceRefresh
    && (!token.expiresAt || token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now());
  if (stillValid) {
    try { return { accessToken: decryptToken(token.accessTokenCipher), apiDomain: metadata.apiDomain }; }
    catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    throw Object.assign(
      new Error('Zoho CRM access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  // This workspace's own datacenter choice (set on the Integrations page —
  // see accountsBase in constants/integrations.js / Integrations.tsx) always
  // wins over the platform-wide env default: two workspaces can have Zoho
  // orgs on different datacenters (.com vs .in vs .eu etc.), and refreshing
  // against the wrong one is exactly what produces Zoho's "invalid_client".
  const accountsBase = settings.accountsBase || env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.com';
  const { clientId, clientSecret } = resolveZohoCredentials(settings);

  const res = await fetch(`${accountsBase}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh Zoho CRM access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  const nextApiDomain = data.api_domain ?? metadata.apiDomain;
  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // Zoho does not reliably reissue refresh_token on refresh; keep the existing one.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    },
  });
  if (nextApiDomain !== metadata.apiDomain) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { metadata: JSON.stringify({ ...metadata, apiDomain: nextApiDomain }) },
    });
  }

  logger.info({ workspaceId, forceRefresh }, 'Zoho CRM access token refreshed');
  return { accessToken: data.access_token, apiDomain: nextApiDomain };
}

/**
 * Central Zoho CRM API caller — every Leads/Notes request in this file goes
 * through here rather than calling fetch() directly, so the reactive
 * refresh-and-retry logic lives in exactly one place instead of being
 * copy-pasted per call site.
 *
 * getValidAccessToken() already refreshes proactively when a token is near
 * its RECORDED expiry, but that's a guess based on our own clock and our own
 * memory of what Zoho said last time — Zoho can still reject a token that
 * looks unexpired on our side (revoked by an org admin, clock drift, the
 * org's OAuth app got reconfigured). Zoho's documented shape for that is
 * HTTP 401 with `code: 'INVALID_TOKEN'` (some endpoints instead say
 * 'AUTHENTICATION_FAILURE'). On exactly that response — and only once per
 * call, so a genuinely dead integration fails once instead of looping — this
 * forces a fresh refresh (bypassing the expiry check) and retries the SAME
 * request with the new token. The caller never sees the transient failure.
 *
 * Returns { res, data } rather than throwing on a non-2xx, because Zoho's
 * bulk-record endpoints (create/update Lead) return HTTP 200/201 even when
 * the individual record failed — callers need both the raw Response (status,
 * ok) and the parsed body (data.data[0].code) to tell success from failure,
 * and what "failure" even means differs per endpoint (search treats 204 as
 * "no match", not an error; create/update treat anything but `code:
 * 'SUCCESS'` as one).
 */
async function zohoRequest(workspaceId, path, options = {}) {
  const attempt = async (forceRefresh) => {
    const { accessToken, apiDomain } = await getValidAccessToken(workspaceId, { forceRefresh });
    if (!apiDomain) throw new Error('Zoho integration has no apiDomain on record — reconnect it.');
    const res = await fetch(`${apiDomain}${path}`, {
      ...options,
      headers: { ...(options.headers ?? {}), Authorization: `Zoho-oauthtoken ${accessToken}` },
      signal: options.signal ?? AbortSignal.timeout(10_000),
    });
    if (res.status === 204) return { res, data: null }; // Zoho's "no content" — never a JSON body
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const first = await attempt(false);
  const isAuthError = first.res.status === 401
    || first.data?.code === 'INVALID_TOKEN'
    || first.data?.code === 'AUTHENTICATION_FAILURE';
  if (!isAuthError) return first;

  logger.warn(
    { workspaceId, status: first.res.status, code: first.data?.code },
    'Zoho API call rejected the access token — forcing a refresh and retrying once',
  );
  return attempt(true);
}

/** Same name-guessing list platform.controller.js's googlecalendar delivery uses. */
const NAME_KEYS = ['candidate_name', 'patient_name', 'customer_name', 'caller_name', 'name', 'full_name'];
/** Same idea for a company, so orgs that made Company mandatory on Leads don't reject the create. */
const COMPANY_KEYS = ['company', 'company_name', 'organization', 'organisation'];
const findVariable = (variables, keys) => {
  for (const k of keys) {
    const hit = variables.find((v) => String(v.key).toLowerCase() === k);
    if (hit?.value) return String(hit.value);
  }
  return null;
};

/**
 * Split a full name into Zoho's mandatory { First_Name, Last_Name } shape.
 * Zoho CRM refuses to create a Lead without Last_Name — a single-token name
 * (or none at all) goes entirely into Last_Name rather than being dropped.
 *
 * No name extracted yet is NOT the same as "this caller is named Unknown
 * Caller" — that string used to be written into Last_Name and then stuck
 * there, reading as a real (wrong) name in the CRM UI and in any report or
 * search built on it. "Lead" is a placeholder, not a guess: it reads as
 * "record not yet named" and gets overwritten the moment a real name is
 * extracted (see pushCallAsLead's update branch, which unconditionally
 * rewrites both name fields once it has one).
 */
const splitName = (fullName) => {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: 'Lead' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

/**
 * Look up an existing Lead by phone number using Zoho's phone-search
 * convenience param (matches against Phone, Mobile, and other phone-type
 * fields on the module). Returns the first match's id, or null for either
 * "genuinely no match" (Zoho returns 204 No Content) or a search failure —
 * callers treat both the same way: fall through to creating a new Lead
 * rather than blocking the whole push on a flaky search call.
 *
 * KNOWN LIMITATION: Zoho's Search Records API reads from an eventually-
 * consistent search index, not live data — a Lead created or updated only
 * seconds ago can be genuinely invisible to this search for up to ~2 minutes
 * (confirmed empirically: a second call for the same number ~1s after the
 * first created it did not match, but did after waiting). Two calls from the
 * same number within that window can therefore still produce two Leads
 * instead of one update. There is no fix on our side for this — it is Zoho's
 * platform behavior — short of maintaining our own phone→leadId cache, which
 * trades this rare race for a new source of staleness and isn't done here.
 */
async function findLeadByPhone(workspaceId, phoneNumber) {
  const { res, data } = await zohoRequest(workspaceId, `/crm/v8/Leads/search?phone=${encodeURIComponent(phoneNumber)}`);
  if (res.status === 204) return null; // no match — Zoho's documented "found nothing" response
  if (!res.ok) {
    logger.warn({ status: res.status, message: data?.message }, 'Zoho Lead search by phone failed — will create a new Lead instead');
    return null;
  }
  return data?.data?.[0]?.id ?? null;
}

/** Attach a call summary to an existing Lead as a Note, rather than overwriting Description. */
async function addNoteToLead(workspaceId, leadId, title, content) {
  const { res, data } = await zohoRequest(workspaceId, `/crm/v8/Leads/${leadId}/Notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [{ Note_Title: title, Note_Content: content }] }),
  });
  const record = data?.data?.[0];
  if (!res.ok || record?.code !== 'SUCCESS') {
    throw new Error(record?.message || data?.message || `Zoho Note creation failed (HTTP ${res.status})`);
  }
}

/**
 * Patch fields on an existing Lead — used to backfill First_Name/Last_Name
 * once a call extracts a real name, so a Lead first created (or matched) with
 * a placeholder "Lead" name gets replaced with the caller's real one.
 */
async function updateLeadFields(workspaceId, leadId, fields) {
  const { res, data } = await zohoRequest(workspaceId, `/crm/v8/Leads/${leadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [{ id: leadId, ...fields }] }),
  });
  const record = data?.data?.[0];
  if (!res.ok || record?.code !== 'SUCCESS') {
    throw new Error(record?.message || data?.message || `Zoho Lead field update failed (HTTP ${res.status})`);
  }
}

/** "candidate_name" -> "Candidate Name" — the key as configured by whoever set up the agent's variables. */
const humanizeKey = (key) =>
  String(key).replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || String(key);

const formatDuration = (durationSec) => {
  const sec = Math.max(0, Number(durationSec) || 0);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
};

/**
 * The Zoho Description/Note field is a plain-text box, not markdown — Zoho
 * renders '\n' as a real line break, so structure comes from blank lines and
 * a leading "- " per line, not from any markup. Variable keys are whatever an
 * agent's admin named them (snake_case), humanized here so the CRM shows
 * "Candidate Name" rather than the raw "candidate_name".
 */
const buildCallSummary = (agent, postCallPayload, variables) => {
  const lines = [
    `Call outcome: ${postCallPayload.outcome ?? 'n/a'}`,
    `Duration: ${formatDuration(postCallPayload.durationSec)}`,
    '',
    'Extracted details:',
  ];
  if (variables.length) {
    for (const v of variables) lines.push(`- ${humanizeKey(v.key)}: ${v.value ?? '(not provided)'}`);
  } else {
    lines.push('- (none extracted)');
  }
  return lines.join('\n');
};

/**
 * Push a completed call to Zoho CRM as a Lead. Fires from deliverPostCall
 * (agentCallLog.controller.js) for any workspace with a connected Zoho
 * integration — no per-agent config, no webhook URL, unlike the Zapier/n8n/
 * Make/GHL dispatch path in integrations.service.js.
 *
 * Search-then-upsert by phone number: a caller who rings back doesn't need
 * (and shouldn't get) a second, disconnected Lead record every time — the
 * existing one gets the new call attached as a Note instead. Only Leads
 * without a phone number on the call skip the search and always create new,
 * since there is nothing to safely match on.
 */
export async function pushCallAsLead(workspaceId, agentId, postCallPayload) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } }).catch(() => null);
  const variables = Array.isArray(postCallPayload.variables) ? postCallPayload.variables : [];
  const phoneNumber = postCallPayload.phoneNumber?.trim();

  // Extracted once and used on both branches below: a matched Lead gets its
  // name backfilled via a field patch (it may have been created before the
  // caller ever gave a name, or matched under the "Lead" placeholder from an
  // earlier call that had none), a new one gets it set directly on create.
  // splitName() always returns a usable Last_Name ("Lead" as the placeholder
  // when nothing was extracted) — required for the create branch, where Zoho
  // rejects a Lead without one. `rawName` itself (not the split result) gates
  // whether the update branch bothers rewriting an already-matched Lead's name
  // at all: no extracted name means nothing worth overwriting the existing
  // value (real or placeholder) with.
  const rawName = findVariable(variables, NAME_KEYS);
  const { firstName, lastName } = splitName(rawName);
  const company = findVariable(variables, COMPANY_KEYS) || 'Not Provided';

  const existingLeadId = phoneNumber ? await findLeadByPhone(workspaceId, phoneNumber) : null;

  if (existingLeadId) {
    if (rawName) {
      try {
        // Both fields are sent explicitly (First_Name as '' when the name was
        // a single token) rather than only the ones that came out non-empty —
        // a PATCH that omits a field leaves Zoho's stored value untouched, so
        // omitting First_Name here would leave a stale one in place instead of
        // clearing it to match the new (single-token) name.
        await updateLeadFields(workspaceId, existingLeadId, {
          First_Name: firstName,
          Last_Name: lastName,
        });
      } catch (err) {
        // Best-effort: a failed rename must not block attaching the call note,
        // which is this branch's primary job.
        logger.warn({ workspaceId, leadId: existingLeadId, err: err.message }, 'Zoho Lead name update failed; continuing to attach call note');
      }
    }
    try {
      await addNoteToLead(
        workspaceId, existingLeadId,
        `Call summary — ${postCallPayload.endedAt ?? new Date().toISOString()}`,
        buildCallSummary(agent, postCallPayload, variables),
      );
    } catch (err) {
      await addLog({ workspaceId, provider: 'zoho', level: 'error', event: 'lead_update_failed', message: `Zoho Lead update failed: ${err.message}`, metadata: { callId: postCallPayload.callId, leadId: existingLeadId } });
      throw new Error(`Zoho Lead update failed: ${err.message}`);
    }
    await addLog({ workspaceId, provider: 'zoho', event: 'lead_updated', message: `Zoho Lead updated with new call (${existingLeadId})`, metadata: { callId: postCallPayload.callId, leadId: existingLeadId } });
    logger.info({ workspaceId, callId: postCallPayload.callId, leadId: existingLeadId }, 'Zoho Lead updated from call (matched by phone)');
    return existingLeadId;
  }

  const leadPayload = {
    data: [{
      Last_Name: lastName,
      First_Name: firstName,
      // Some Zoho orgs customise the Leads layout to make Company mandatory
      // (it isn't on a stock layout). We never have a real company from a
      // phone call unless the agent's variables extracted one, so this is a
      // deliberate placeholder, not a guess — same spirit as Last_Name:
      // "Lead" above.
      Company: company,
      ...(phoneNumber ? { Phone: phoneNumber } : {}),
      Lead_Source: agent?.name ? `Spandan — ${agent.name}` : 'Spandan',
      Description: buildCallSummary(agent, postCallPayload, variables),
    }],
    trigger: [], // explicit no-op: don't fire the org's own Zoho workflow rules on this insert
  };

  const { res, data } = await zohoRequest(workspaceId, '/crm/v8/Leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leadPayload),
  });
  // Zoho's bulk-record APIs return HTTP 201/200 even when an individual record
  // in the batch failed — the real result is data.data[0].code, not res.ok.
  const record = data?.data?.[0];
  if (!res.ok || record?.code !== 'SUCCESS') {
    const detail = record?.message || data?.message || `HTTP ${res.status}`;
    await addLog({ workspaceId, provider: 'zoho', level: 'error', event: 'lead_push_failed', message: `Zoho Lead creation failed: ${detail}`, metadata: { callId: postCallPayload.callId } });
    throw new Error(`Zoho Lead creation failed: ${detail}`);
  }

  await addLog({ workspaceId, provider: 'zoho', event: 'lead_pushed', message: `Zoho Lead created (${record.details?.id})`, metadata: { callId: postCallPayload.callId, leadId: record.details?.id } });
  logger.info({ workspaceId, callId: postCallPayload.callId, leadId: record.details?.id }, 'Zoho Lead created from call');
  return record.details?.id;
}
