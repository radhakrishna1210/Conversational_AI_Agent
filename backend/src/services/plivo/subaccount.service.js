// Plivo subaccounts, one per workspace.
//
// A subaccount is NOT a billing boundary — charges from every subaccount
// aggregate to our parent account, we pay Plivo, and the client pays us from
// their wallet. Never surface a Plivo balance to a client. What it actually
// buys us:
//
//   Reputation isolation  Indian carriers score caller IDs on volume, pacing and
//                         complaint rate, and numbers under one account can be
//                         throttled together. One tenant's bad campaign must not
//                         poison another tenant's numbers.
//   Attribution           Plivo reports usage per subaccount, giving a carrier-
//                         side ground truth to reconcile AgentCallLog against.
//   Blast radius          enabled=false stops one tenant's carrier traffic
//                         instantly — the kill switch behind WorkspaceCompliance
//                         `suspended`.
//
// The last two only hold because calls are DIALLED as the subaccount — see
// telephony/dialCredentials.js. A call placed with main-account credentials
// attributes to the parent and ignores the kill switch.
//
// It buys us nothing at all in terms of caller-ID display: a subaccount's `name`
// is an internal label, never transmitted on a call. See PLIVO_INTEGRATION.md §1.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { encryptToken, decryptToken } from '../../lib/encryption.js';
import { resolveAnswerUrlBase } from '../telephony/plivo.provider.js';
import { plivoRequest, mainCredentials, PlivoError } from './client.js';

/**
 * Plivo's subaccount name is capped and purely internal. Prefixing with the
 * workspace id makes the Plivo console navigable back to our data — without it,
 * two clients with similar trading names are indistinguishable when you are
 * staring at a console at 2am trying to work out whose traffic to kill.
 */
const subaccountName = (workspaceId, entityName) =>
  `ws_${workspaceId} ${entityName || ''}`.trim().slice(0, 100);

/** The workspace id a subaccount name claims, or null — the inverse of the above. */
export const workspaceIdFromSubaccountName = (name) => {
  const m = /^ws_([A-Za-z0-9_-]+)/.exec(String(name ?? ''));
  return m ? m[1] : null;
};

/** Plivo application names allow letters, digits, hyphen and underscore only. */
const applicationName = (workspaceId) => `ws_${workspaceId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

/** Plivo pages every list at 20. */
const PAGE = 20;

const requireMain = () => {
  const creds = mainCredentials();
  if (!creds) {
    throw new PlivoError(
      'Plivo is not configured on this server (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN missing).',
      { status: 503 },
    );
  }
  return creds;
};

// ── Credential cache ────────────────────────────────────────────────────────
//
// Every Plivo dial from a subaccount-held number needs these credentials, and a
// database round trip from this deployment measures ~490ms — audible dead air
// before the phone even rings, on every call of a campaign. They change only
// through this module, which forgets the entry whenever it writes one, so a
// short-lived cache is safe. The TTL bounds the damage if a row is ever edited
// behind our back (a second process, a console fix).

const CREDENTIAL_TTL_MS = 10 * 60 * 1000;
/** workspaceId -> { at, value } — `value` null when the workspace has no row. */
const credentialCache = new Map();

/** Drop one workspace's cached credentials, or all of them. */
export function forgetSubaccountCredentials(workspaceId) {
  if (workspaceId) credentialCache.delete(workspaceId);
  else credentialCache.clear();
}

/** The workspace's subaccount row, or null. */
export function getSubaccount(workspaceId) {
  return prisma.plivoSubaccount.findUnique({ where: { workspaceId } });
}

/** The row holding a given subaccount auth id, or null. */
export function getSubaccountByAuthId(authId) {
  if (!authId) return Promise.resolve(null);
  return prisma.plivoSubaccount.findUnique({ where: { authId: String(authId) } });
}

/**
 * Create the workspace's Plivo subaccount.
 *
 * Idempotent by workspace: if a row already exists it is returned untouched
 * rather than creating a second subaccount. Provisioning gets retried by
 * operators far more often than it succeeds first time, and a duplicate
 * subaccount is real spend nobody is watching.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {string} [opts.entityName]  legal entity, for the console label only
 * @returns {Promise<object>} the PlivoSubaccount row
 */
export async function createSubaccount(workspaceId, { entityName } = {}) {
  const existing = await getSubaccount(workspaceId);
  if (existing) return existing;

  const credentials = requireMain();
  const name = subaccountName(workspaceId, entityName);

  // `enabled` defaults to FALSE at Plivo — pass it explicitly or the subaccount
  // is created dead and every call from it fails for no visible reason.
  const created = await plivoRequest('/Subaccount/', {
    method: 'POST',
    json: { name, enabled: true },
    credentials,
    idempotent: false,
  });

  const authId = created.auth_id;
  const authToken = created.auth_token;
  if (!authId || !authToken) {
    throw new PlivoError('Plivo created a subaccount but returned no auth_id/auth_token.', {
      body: created,
    });
  }

  try {
    const row = await prisma.plivoSubaccount.create({
      data: {
        workspaceId,
        authId,
        authTokenEnc: encryptToken(authToken),
        name,
        enabled: true,
      },
    });
    forgetSubaccountCredentials(workspaceId);
    return row;
  } catch (dbError) {
    // The subaccount exists at Plivo and we have no row for it. Plivo would give
    // the token back on a GET (see relinkSubaccount), but a write that failed a
    // moment ago is a poor bet to succeed now, and an unrecorded subaccount is
    // invisible to everything that manages them. Deleting it is the way back to
    // a consistent state; a retry then creates a fresh one.
    logger.error(
      { workspaceId, authId, err: dbError.message },
      'Failed to persist Plivo subaccount — deleting the orphaned subaccount',
    );
    await plivoRequest(`/Subaccount/${authId}/`, {
      method: 'DELETE',
      query: { cascade: 'true' },
      credentials,
      idempotent: false,
    }).catch((cleanupError) => {
      // Now genuinely stuck: a subaccount exists that we could not record and
      // could not delete. The carrier audit lists it; relink or delete it there.
      logger.error(
        { workspaceId, authId, err: cleanupError.message },
        'ORPHANED PLIVO SUBACCOUNT — relink or delete it from Admin → Numbers & Carrier',
      );
    });
    throw dbError;
  }
}

/**
 * Credentials to authenticate AS the workspace's subaccount.
 *
 * Used for placing calls, so usage attributes to the right tenant and the
 * enabled=false kill switch actually bites. Returns null when the workspace has
 * no subaccount — callers decide whether that is a refusal.
 *
 * @returns {Promise<{authId: string, authToken: string, enabled: boolean}|null>}
 */
export async function subaccountCredentials(workspaceId) {
  if (!workspaceId) return null;
  const hit = credentialCache.get(workspaceId);
  if (hit && Date.now() - hit.at < CREDENTIAL_TTL_MS) return hit.value;

  const row = await getSubaccount(workspaceId);
  let value = null;
  if (row) {
    try {
      value = { authId: row.authId, authToken: decryptToken(row.authTokenEnc), enabled: row.enabled };
    } catch (err) {
      // A token that will not decrypt means ENCRYPTION_KEY changed under us. Fail
      // loudly: silently falling back to main credentials would bill this
      // tenant's traffic to the parent account and quietly defeat the isolation.
      logger.error({ workspaceId, err: err.message }, 'Could not decrypt Plivo subaccount token');
      throw new PlivoError('Stored Plivo subaccount credentials could not be decrypted.', {
        status: 500,
      });
    }
  }
  credentialCache.set(workspaceId, { at: Date.now(), value });
  return value;
}

/**
 * Enable or disable a workspace's carrier traffic.
 *
 * This is the kill switch. Disabling stops that tenant's calls at the carrier
 * without touching anyone else's.
 */
export async function setSubaccountEnabled(workspaceId, enabled) {
  const row = await getSubaccount(workspaceId);
  if (!row) throw new PlivoError(`Workspace ${workspaceId} has no Plivo subaccount.`, { status: 404 });

  const credentials = requireMain();
  await plivoRequest(`/Subaccount/${row.authId}/`, {
    method: 'POST',
    // `name` is required on update even when only `enabled` changes.
    json: { name: row.name, enabled: Boolean(enabled) },
    credentials,
    // Safe to retry: setting the same flag twice is the same end state.
    idempotent: true,
  });

  const updated = await prisma.plivoSubaccount.update({
    where: { workspaceId },
    data: { enabled: Boolean(enabled) },
  });
  forgetSubaccountCredentials(workspaceId);
  return updated;
}

/**
 * Delete the workspace's subaccount at Plivo and locally.
 *
 * `cascade` defaults to TRUE, against Plivo's own default. With cascade=false
 * Plivo REASSIGNS the subaccount's numbers to the parent account instead of
 * releasing them — so on teardown they would silently accumulate on our parent
 * account, still billing monthly, still carrying the previous tenant's
 * reputation. releaseNumber() deliberately never hands a number to another
 * workspace, so there is nothing that would ever pick them back up.
 */
export async function deleteSubaccount(workspaceId, { cascade = true } = {}) {
  const row = await getSubaccount(workspaceId);
  if (!row) return { deleted: false, reason: 'no subaccount' };

  const credentials = requireMain();
  try {
    await plivoRequest(`/Subaccount/${row.authId}/`, {
      method: 'DELETE',
      query: { cascade: String(cascade) },
      credentials,
      idempotent: false,
    });
  } catch (err) {
    // Already gone at the carrier: removing our row is then the correct end
    // state rather than a failure.
    if (!(err instanceof PlivoError && err.status === 404)) throw err;
    logger.warn({ workspaceId, authId: row.authId }, 'Plivo has no such subaccount; removing our row anyway');
  }

  await prisma.plivoSubaccount.delete({ where: { workspaceId } });
  forgetSubaccountCredentials(workspaceId);
  return { deleted: true, authId: row.authId };
}

/**
 * The Plivo application numbers in this subaccount answer on.
 *
 * Created UNDER the subaccount (the `subaccount` parameter, main credentials)
 * rather than reusing the parent's PLIVO_VOICE_APP_ID: whether a subaccount's
 * number may use an application its parent owns is undocumented, and an
 * application associated with the subaccount is the configuration Plivo does
 * document. Its answer URL carries no workspace or agent — inbound calls are
 * routed from the called number (plivo/inbound.service.js).
 *
 * @returns {Promise<string|null>} the app id, or null when this server has no
 *   public answer URL to point one at (the caller falls back to
 *   PLIVO_VOICE_APP_ID)
 */
export async function ensureSubaccountApplication(workspaceId) {
  const row = await getSubaccount(workspaceId);
  if (!row) throw new PlivoError(`Workspace ${workspaceId} has no Plivo subaccount.`, { status: 404 });
  if (row.appId) return row.appId;

  const answerUrl = resolveAnswerUrlBase();
  if (!answerUrl) return null;

  const credentials = requireMain();
  const created = await plivoRequest('/Application/', {
    method: 'POST',
    json: {
      app_name: applicationName(workspaceId),
      answer_url: answerUrl,
      answer_method: 'POST',
      hangup_url: answerUrl.replace(/\/answer$/, '/hangup'),
      hangup_method: 'POST',
      subaccount: row.authId,
    },
    credentials,
    // A retried create is a second application nobody points anything at.
    idempotent: false,
  });

  const appId = created?.app_id ? String(created.app_id) : null;
  if (!appId) throw new PlivoError('Plivo created an application but returned no app_id.', { body: created });

  await prisma.plivoSubaccount.update({ where: { workspaceId }, data: { appId } });
  logger.info({ workspaceId, appId }, 'Created the Plivo application for this subaccount');
  return appId;
}

/**
 * Attach an EXISTING Plivo subaccount to a workspace, fetching its token.
 *
 * Plivo returns a subaccount's auth_token on GET, so a subaccount whose row was
 * lost — a failed write after creation, a restore, a console-made subaccount —
 * is recoverable rather than orphaned. Refuses to take a subaccount another
 * workspace holds, and refuses to silently replace this workspace's own unless
 * asked: the replaced one would become the orphan instead.
 */
export async function relinkSubaccount(workspaceId, authId, { replace = false } = {}) {
  const id = String(authId ?? '').trim();
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) {
    return { ok: false, error: 'That does not look like a Plivo subaccount auth id (e.g. SA2025RK4E639VJFZAMM).' };
  }

  const holder = await getSubaccountByAuthId(id);
  if (holder && holder.workspaceId !== workspaceId) {
    return { ok: false, error: `That subaccount is already linked to workspace ${holder.workspaceId}.` };
  }
  const existing = await getSubaccount(workspaceId);
  if (existing && existing.authId !== id && !replace) {
    return {
      ok: false,
      error: `This workspace is already linked to subaccount ${existing.authId}. Replace it explicitly, or offboard first.`,
    };
  }

  const credentials = requireMain();
  const sub = await plivoRequest(`/Subaccount/${encodeURIComponent(id)}/`, { method: 'GET', credentials });
  if (!sub?.auth_token) {
    throw new PlivoError('Plivo returned that subaccount without an auth token.', { status: 502 });
  }

  const data = {
    authId: id,
    authTokenEnc: encryptToken(String(sub.auth_token)),
    name: sub.name || subaccountName(workspaceId),
    enabled: sub.enabled !== false && sub.enabled !== 'false',
  };
  const row = await prisma.plivoSubaccount.upsert({
    where: { workspaceId },
    // A different subaccount means a different application; the old app id
    // would attach new numbers to the previous subaccount's app.
    update: existing && existing.authId !== id ? { ...data, appId: null } : data,
    create: { workspaceId, ...data },
  });
  forgetSubaccountCredentials(workspaceId);
  logger.warn({ workspaceId, authId: id, replaced: existing?.authId ?? null }, 'Relinked a Plivo subaccount');
  return { ok: true, subaccount: row };
}

// ── Carrier audit ───────────────────────────────────────────────────────────

/**
 * Every subaccount under our main account, as Plivo sees them. Never returns
 * tokens — this feeds an admin screen.
 */
export async function listCarrierSubaccounts({ maxPages = 50 } = {}) {
  const credentials = requireMain();
  const out = [];
  for (let page = 0; page < maxPages; page += 1) {
    const res = await plivoRequest('/Subaccount/', {
      method: 'GET',
      query: { limit: String(PAGE), offset: String(page * PAGE) },
      credentials,
    });
    const objects = Array.isArray(res?.objects) ? res.objects : [];
    for (const o of objects) {
      out.push({
        authId: String(o.auth_id ?? ''),
        name: String(o.name ?? ''),
        enabled: o.enabled !== false && o.enabled !== 'false',
        created: o.created ?? null,
      });
    }
    const total = Number(res?.meta?.total_count);
    if (objects.length < PAGE || (Number.isFinite(total) && out.length >= total)) break;
  }
  return out;
}

/**
 * Compare the carrier's subaccounts with our rows. Pure, for the tests.
 *
 *   orphaned          at Plivo, no row here — possibly billing, certainly unmanaged
 *   missingAtCarrier  a row here, gone at Plivo — every dial from it will fail
 *   enabledDrift      the kill switch says one thing here and another there
 *
 * @param {Array<{authId, name, enabled}>} carrier
 * @param {Array<{authId, workspaceId, enabled, name}>} rows
 * @param {Set<string>} [knownWorkspaceIds]  workspaces that exist, for orphans that name one
 */
export function diffSubaccounts(carrier = [], rows = [], knownWorkspaceIds = new Set()) {
  const byAuth = new Map(rows.map((r) => [r.authId, r]));
  const seen = new Set();
  const linked = [];
  const orphaned = [];
  const enabledDrift = [];

  for (const c of carrier) {
    const row = byAuth.get(c.authId);
    if (row) {
      seen.add(c.authId);
      linked.push({ ...c, workspaceId: row.workspaceId });
      if (Boolean(row.enabled) !== Boolean(c.enabled)) {
        enabledDrift.push({
          authId: c.authId, workspaceId: row.workspaceId, carrierEnabled: c.enabled, ourEnabled: row.enabled,
        });
      }
    } else {
      const claimedWorkspaceId = workspaceIdFromSubaccountName(c.name);
      orphaned.push({
        ...c,
        claimedWorkspaceId,
        workspaceExists: claimedWorkspaceId ? knownWorkspaceIds.has(claimedWorkspaceId) : false,
      });
    }
  }

  const missingAtCarrier = rows
    .filter((r) => !seen.has(r.authId))
    .map((r) => ({ authId: r.authId, workspaceId: r.workspaceId, name: r.name }));

  return { linked, orphaned, missingAtCarrier, enabledDrift };
}

/** The carrier audit the admin console renders. */
export async function auditSubaccounts() {
  const [carrier, rows] = await Promise.all([
    listCarrierSubaccounts(),
    prisma.plivoSubaccount.findMany({ select: { authId: true, workspaceId: true, enabled: true, name: true } }),
  ]);

  const claimed = [...new Set(carrier.map((c) => workspaceIdFromSubaccountName(c.name)).filter(Boolean))];
  const workspaces = claimed.length
    ? await prisma.workspace.findMany({ where: { id: { in: claimed } }, select: { id: true, name: true } })
    : [];
  const names = new Map(workspaces.map((w) => [w.id, w.name]));

  const diff = diffSubaccounts(carrier, rows, new Set(names.keys()));
  for (const o of diff.orphaned) o.workspaceName = o.claimedWorkspaceId ? names.get(o.claimedWorkspaceId) ?? null : null;

  return {
    checkedAt: new Date().toISOString(),
    carrierCount: carrier.length,
    localCount: rows.length,
    ...diff,
  };
}
