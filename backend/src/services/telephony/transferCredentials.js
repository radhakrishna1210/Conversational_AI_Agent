// backend/src/services/telephony/transferCredentials.js
//
// Which carrier account may redirect a LIVE call for a human transfer.
//
// A live call belongs to the account that holds our end of it. For Plivo that is
// the workspace's subaccount only when OUR number — the caller ID we dialled
// from, or the number an inbound caller rang — is one rented into that
// subaccount. The bridge used to reach for the subaccount whenever the workspace
// had one, so a call placed from a number the MAIN account holds (a platform
// number, one recorded by hand) was redirected with the subaccount's credentials,
// which cannot see that call: Plivo 404s, and the caller hears "nobody could be
// reached" when nothing was dialled at all.
//
// The same rule dialCredentials.js applies when placing the call, read from the
// same VoiceNumber row.

import { TELEPHONY_PROVIDER } from '../../constants/compliance.js';

/**
 * @param {object} p
 * @param {string} p.carrierId       'PLIVO' | 'TWILIO' | …
 * @param {string} p.workspaceId
 * @param {string} [p.callLogId]     read for our number when `ourNumber` is unknown
 * @param {string|null} [p.ourNumber] our end of the call, if the carrier said
 * @param {object} deps
 * @param {(number: string) => Promise<{subaccountId?: string|null}|null>} deps.findNumber
 * @param {(callLogId: string) => Promise<{fromNumber?: string|null}|null>} deps.findCallLog
 * @param {(workspaceId: string) => Promise<{authId: string, authToken: string}|null>} deps.subaccountCredentials
 * @returns {Promise<{authId: string, authToken: string}|null>} null = the main account
 */
export async function transferCredentialsFor(
  { carrierId, workspaceId, callLogId = null, ourNumber = null },
  { findNumber, findCallLog, subaccountCredentials },
) {
  if (String(carrierId || '').toUpperCase() !== TELEPHONY_PROVIDER.PLIVO) return null;

  // The call log's fromNumber is OUR number for both directions (the dialler
  // writes the caller ID; an inbound log records the number that was rung) and it
  // is stored the way VoiceNumber stores numbers, so it is tried first. The
  // carrier's own copy often arrives as bare digits (Plivo sends 9122…), which
  // an exact lookup would miss, so it is tried with a '+' as well.
  const logged = callLogId ? (await findCallLog(callLogId))?.fromNumber ?? null : null;
  const digits = String(ourNumber || '').replace(/[^\d]/g, '');
  const candidates = [...new Set([logged, ourNumber, digits && `+${digits}`].filter(Boolean))];
  if (!candidates.length) {
    // Nothing to decide on. The subaccount, when the workspace has one, is the
    // likelier owner — every number a client rents goes into it — and it is what
    // this did before, so an unknown number costs nothing it did not already.
    return subaccountCredentials(workspaceId);
  }

  let row = null;
  for (const number of candidates) {
    row = await findNumber(number);
    if (row) break;
  }
  // No row: a number the main account holds, which is exactly the case that
  // used to be sent to the subaccount and 404.
  if (!row?.subaccountId) return null;

  const sub = await subaccountCredentials(workspaceId);
  // A number held by a subaccount that is not this workspace's is not a call
  // this workspace's credentials can move either; the main account at least
  // fails with the carrier's own answer rather than ours.
  return sub && sub.authId === row.subaccountId ? sub : null;
}
