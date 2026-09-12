// Which credentials a call is dialled with.
//
// A carrier's `status()` answers with the platform's own credentials — for
// Plivo, the MAIN account. That is right for a number the main account holds
// (PLIVO_FROM_NUMBER, a number recorded by hand), and wrong for a number rented
// into a workspace's subaccount: dialled with main credentials, the usage lands
// on the parent account, per-client reconciliation has nothing to reconcile, and
// disabling the subaccount — the per-client kill switch — stops nothing, because
// no call was ever placed as it. Whether Plivo even lets the main account use a
// subaccount's number as caller ID is undocumented; dialling as the subaccount
// is the path that is documented to work.
//
// So a Plivo number whose VoiceNumber row names a subaccount is dialled AS that
// subaccount, and anything that stops that being possible refuses the call
// rather than quietly falling back to the main account.

import { TELEPHONY_PROVIDER } from '../../constants/compliance.js';
import { subaccountCredentials } from '../plivo/subaccount.service.js';

/**
 * @param {object} provider                   the resolved carrier
 * @param {object} base                       provider.status(fromNumber) — `{ ready, ...creds }`
 * @param {object} routing
 * @param {string} routing.workspaceId        the workspace placing the call
 * @param {string} [routing.subaccountId]     VoiceNumber.subaccountId of the caller ID
 * @param {object} [deps]                     injected for the tests
 * @returns {Promise<{ready: boolean, error?: string, code?: string, status?: number}>}
 *   the credentials to dial with, in the same shape `status()` returns
 */
export async function resolveDialCredentials(
  provider,
  base,
  { workspaceId, subaccountId } = {},
  deps = { subaccountCredentials },
) {
  if (!base?.ready) return base;
  if (provider?.id !== TELEPHONY_PROVIDER.PLIVO || !subaccountId) return base;

  let sub;
  try {
    sub = await deps.subaccountCredentials(workspaceId);
  } catch (err) {
    // A token that will not decrypt. Falling back to main credentials would bill
    // this client's traffic to the parent account and defeat the isolation the
    // subaccount exists for — refuse, loudly, instead.
    return { ready: false, status: 503, code: 'CARRIER_CREDENTIALS', error: err.message };
  }

  if (!sub) {
    return {
      ready: false,
      status: 503,
      code: 'CARRIER_CREDENTIALS',
      error: `This number is held by carrier subaccount ${subaccountId}, but this workspace has no `
        + 'subaccount credentials on record. An admin can relink it from Admin → Numbers & Carrier.',
    };
  }

  if (sub.authId !== subaccountId) {
    // The caller ID belongs to a different subaccount than this workspace's own:
    // either the number is another client's, or the row is wrong. Neither is a
    // call to place.
    return {
      ready: false,
      status: 403,
      code: 'CARRIER_SUBACCOUNT_MISMATCH',
      error: 'That caller ID is not held by this workspace\'s carrier account.',
    };
  }

  if (sub.enabled === false) {
    return {
      ready: false,
      status: 403,
      code: 'CARRIER_DISABLED',
      error: 'Calling is disabled for this workspace at the carrier. Contact support.',
    };
  }

  return { ...base, authId: sub.authId, authToken: sub.authToken, subaccount: true };
}
