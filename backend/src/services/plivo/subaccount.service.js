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
// It buys us nothing at all in terms of caller-ID display: a subaccount's `name`
// is an internal label, never transmitted on a call. See PLIVO_INTEGRATION.md §1.

import prisma from '../../config/prisma.js';
import logger from '../../lib/logger.js';
import { encryptToken, decryptToken } from '../../lib/encryption.js';
import { plivoRequest, mainCredentials, PlivoError } from './client.js';

/**
 * Plivo's subaccount name is capped and purely internal. Prefixing with the
 * workspace id makes the Plivo console navigable back to our data — without it,
 * two clients with similar trading names are indistinguishable when you are
 * staring at a console at 2am trying to work out whose traffic to kill.
 */
const subaccountName = (workspaceId, entityName) =>
  `ws_${workspaceId} ${entityName || ''}`.trim().slice(0, 100);

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

/** The workspace's subaccount row, or null. */
export function getSubaccount(workspaceId) {
  return prisma.plivoSubaccount.findUnique({ where: { workspaceId } });
}

/**
 * Create the workspace's Plivo subaccount.
 *
 * Idempotent by workspace: if a row already exists it is returned untouched
 * rather than creating a second subaccount. Provisioning gets retried by
 * operators far more often than it succeeds first time, and a duplicate
 * subaccount is real spend under a token we would never see again.
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
    return await prisma.plivoSubaccount.create({
      data: {
        workspaceId,
        authId,
        authTokenEnc: encryptToken(authToken),
        name,
        enabled: true,
      },
    });
  } catch (dbError) {
    // The auth_token is returned EXACTLY ONCE, in the 201 above, and is never
    // retrievable from the API again. If we cannot persist it the subaccount is
    // already orphaned — it exists at Plivo, we can no longer authenticate as
    // it, and it will sit there accruing whatever is attached to it. Deleting it
    // immediately is the only way back to a consistent state, so that a retry
    // can create a fresh one.
    logger.error(
      { workspaceId, authId, err: dbError.message },
      'Failed to persist Plivo subaccount token — deleting the orphaned subaccount',
    );
    await plivoRequest(`/Subaccount/${authId}/`, {
      method: 'DELETE',
      query: { cascade: 'true' },
      credentials,
      idempotent: false,
    }).catch((cleanupError) => {
      // Now genuinely stuck: a subaccount exists that we cannot authenticate as
      // and could not delete. This needs a human in the Plivo console.
      logger.error(
        { workspaceId, authId, err: cleanupError.message },
        'ORPHANED PLIVO SUBACCOUNT — delete it manually in the Plivo console',
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
 * no subaccount — callers decide whether to fall back to main credentials.
 */
export async function subaccountCredentials(workspaceId) {
  const row = await getSubaccount(workspaceId);
  if (!row) return null;
  try {
    return { authId: row.authId, authToken: decryptToken(row.authTokenEnc) };
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
    json: { name: row.name, enabled },
    credentials,
    // Safe to retry: setting the same flag twice is the same end state.
    idempotent: true,
  });

  return prisma.plivoSubaccount.update({
    where: { workspaceId },
    data: { enabled },
  });
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
  await plivoRequest(`/Subaccount/${row.authId}/`, {
    method: 'DELETE',
    query: { cascade: String(cascade) },
    credentials,
    idempotent: false,
  });

  await prisma.plivoSubaccount.delete({ where: { workspaceId } });
  return { deleted: true, authId: row.authId };
}
