// backend/src/services/hubspot.service.js
/**
 * HubSpot CRM operations for post-call delivery: sync the caller as a
 * contact, then log the call on that contact's timeline.
 *
 * Scope for this pass is deliberately Contact + Call engagement only — no
 * Deal creation. Endpoint, method, request/response shape, and the call
 * association below are all confirmed directly against HubSpot's own
 * developer docs (developers.hubspot.com, checked 2026-09-11) — not just
 * recalled from memory. Anything still unconfirmed is called out inline.
 */

import logger from '../lib/logger.js';
import { hubspotFetch } from './hubspotAuth.service.js';

const CRM_API = 'https://api.hubapi.com/crm/v3';

/**
 * Create-or-update a contact keyed by email, via HubSpot's CRM v3 batch
 * upsert endpoint (POST .../objects/contacts/batch/upsert with idProperty).
 * Endpoint, request body shape ({ inputs: [{ idProperty, id, properties }] }),
 * and the response shape (`results[].id`, synchronous — no polling) are all
 * confirmed against HubSpot's own API reference for this endpoint.
 *
 * @param {string} workspaceId
 * @param {object} contact
 * @param {string} contact.email    – required; the upsert key
 * @param {string} [contact.phone]
 * @param {string} [contact.firstname]
 * @param {string} [contact.lastname]
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function upsertContact(workspaceId, { email, phone, firstname, lastname } = {}) {
  const trimmedEmail = String(email ?? '').trim();
  if (!trimmedEmail) {
    throw Object.assign(new Error('A contact email is required to sync to HubSpot'), { statusCode: 400 });
  }

  const properties = {
    email: trimmedEmail,
    ...(phone ? { phone: String(phone).trim() } : {}),
    ...(firstname ? { firstname: String(firstname).trim() } : {}),
    ...(lastname ? { lastname: String(lastname).trim() } : {}),
  };

  const data = await hubspotFetch(workspaceId, `${CRM_API}/objects/contacts/batch/upsert`, {
    method: 'POST',
    body: JSON.stringify({ inputs: [{ idProperty: 'email', id: trimmedEmail, properties }] }),
  });

  const result = data?.results?.[0];
  if (!result?.id) {
    throw new Error('HubSpot did not return a contact id for the upsert');
  }

  logger.info({ workspaceId, contactId: result.id }, 'HubSpot contact upserted');
  return { id: result.id, email: trimmedEmail };
}

/**
 * Log a call on a contact's timeline via HubSpot's Calls engagement object
 * (CRM v3 `objects/calls`) — the modern successor to the deprecated v1
 * Engagements API. Associates the call to the contact so it shows on their
 * timeline.
 *
 * `associationTypeId: 194` / `associationCategory: 'HUBSPOT_DEFINED'` for
 * call-to-contact is copied verbatim from the example request body in
 * HubSpot's own Calls API guide.
 *
 * `hs_call_disposition` is intentionally NOT set from `callOutcome`.
 * HubSpot's own docs confirm dispositions are portal-specific GUIDs chosen
 * from a fixed list configured in Settings → Objects → Calls (e.g.
 * `f240bbac-87c9-4f6e-bf70-924b57d47db7` for "Connected"), not free text —
 * so `callOutcome` is folded into `hs_call_body` instead. Wiring it to a real
 * disposition needs a portal-specific GUID map the caller would supply.
 *
 * @param {string} workspaceId
 * @param {string} contactId
 * @param {object} call
 * @param {string} [call.summary]
 * @param {string} [call.callOutcome]
 * @param {string|Date} [call.timestamp] – defaults to now
 * @param {string} [call.direction] – 'INBOUND' | 'OUTBOUND', from AgentCallLog.direction; defaults to 'INBOUND'
 * @returns {Promise<{ id: string }>}
 */
export async function logCallEngagement(workspaceId, contactId, { summary, callOutcome, timestamp, direction } = {}) {
  if (!contactId) {
    throw Object.assign(new Error('A contact id is required to log a call engagement'), { statusCode: 400 });
  }

  // HubSpot's own Calls API example sends this as an ISO 8601 string, not
  // epoch milliseconds — confirmed against developers.hubspot.com's Calls
  // API guide (2026-09-11).
  const hsTimestamp = new Date(timestamp ?? Date.now()).toISOString();
  const body = [callOutcome ? `Outcome: ${callOutcome}` : null, summary || null].filter(Boolean).join('\n\n');

  const data = await hubspotFetch(workspaceId, `${CRM_API}/objects/calls`, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        hs_timestamp: hsTimestamp,
        hs_call_title: 'Call logged by Spandan AI Agent',
        hs_call_body: body || undefined,
        hs_call_status: 'COMPLETED',
        // Sourced from AgentCallLog.direction — see outboundCall.service.js
        // (the only path that sets it to OUTBOUND) and deliverPostCall
        // (agentCallLog.controller.js), which copies it into payload.direction.
        hs_call_direction: direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
      }],
    }),
  });

  if (!data?.id) {
    throw new Error('HubSpot did not return a call engagement id');
  }

  logger.info({ workspaceId, contactId, callEngagementId: data.id }, 'HubSpot call engagement logged');
  return { id: data.id };
}
