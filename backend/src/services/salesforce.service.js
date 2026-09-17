// backend/src/services/salesforce.service.js
/**
 * Salesforce CRM operations for post-call delivery: sync the caller as a
 * Contact, then log the call as a Task activity on that Contact.
 *
 * Scope is Contact + Task only — no Lead/Opportunity handling, matching
 * hubspot.service.js's scope.
 *
 * API version is resolved dynamically per workspace (getApiVersion), not
 * hardcoded — a Developer Edition org's rollout regularly lags behind
 * Salesforce's current platform version, so a fixed version eventually 404s
 * on orgs that don't have it yet. The existing manual-token Salesforce
 * syncEndpoint in constants/integrations.js is still hardcoded to v60.0 —
 * that's a separate, stale code path, not a convention worth matching here.
 *
 * sObject Rows by External ID upsert (PATCH .../sobjects/{Object}/
 * {externalIdField}/{value}) doesn't apply to Contact.Email — only a field
 * explicitly marked as an External ID (a custom field) works with it. So
 * upsert-by-email below is manual: SOQL query by email, then POST (create)
 * or PATCH by Id (update).
 *
 * NEEDS VERIFICATION (accepted risk — will be confirmed by a live test):
 * ActivityDate is assumed Date-only (YYYY-MM-DD), and `Type: 'Call'` (not
 * TaskSubtype, which is normally auto-populated by whichever UI action
 * created the record and may not be writable via a raw API create) is used
 * to mark the Task as a call.
 */

import logger from '../lib/logger.js';
import { resolveTimestamp } from '../lib/dates.js';
import { salesforceFetch, getApiVersion } from './salesforceAuth.service.js';

const dataApi = async (workspaceId) => `/services/data/${await getApiVersion(workspaceId)}`;

/** Escapes a value for safe interpolation into a SOQL string literal. */
const soqlEscape = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Create-or-update a Contact keyed by email.
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
    throw Object.assign(new Error('A contact email is required to sync to Salesforce'), { statusCode: 400 });
  }

  const api = await dataApi(workspaceId);
  const soql = `SELECT Id FROM Contact WHERE Email = '${soqlEscape(trimmedEmail)}' LIMIT 1`;
  const queryResult = await salesforceFetch(workspaceId, `${api}/query?q=${encodeURIComponent(soql)}`);
  const existingId = queryResult?.records?.[0]?.Id;

  const fields = {
    Email: trimmedEmail,
    ...(phone ? { Phone: String(phone).trim() } : {}),
    ...(firstname ? { FirstName: String(firstname).trim() } : {}),
  };

  if (existingId) {
    // LastName is only required on create, so an existing Contact's is left
    // untouched here rather than overwritten with the fallback below.
    if (lastname) fields.LastName = String(lastname).trim();
    await salesforceFetch(workspaceId, `${api}/sobjects/Contact/${existingId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
    logger.info({ workspaceId, contactId: existingId }, 'Salesforce contact updated');
    return { id: existingId, email: trimmedEmail };
  }

  // Contact.LastName is required on create; 'Unknown' is a deliberate
  // generic placeholder, not an inferred value from the email.
  fields.LastName = lastname ? String(lastname).trim() : 'Unknown';
  const created = await salesforceFetch(workspaceId, `${api}/sobjects/Contact`, {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  if (!created?.id) {
    throw new Error('Salesforce did not return a contact id for the create');
  }
  logger.info({ workspaceId, contactId: created.id }, 'Salesforce contact created');
  return { id: created.id, email: trimmedEmail };
}

/**
 * Log a call as a Task activity linked to a Contact via WhoId.
 *
 * @param {string} workspaceId
 * @param {string} contactId
 * @param {object} call
 * @param {string} [call.summary]
 * @param {string} [call.direction] – 'INBOUND' | 'OUTBOUND'; defaults to 'INBOUND'
 * @param {string|Date} [call.timestamp] – defaults to now
 * @returns {Promise<{ id: string }>}
 */
export async function logCallActivity(workspaceId, contactId, { summary, direction, timestamp } = {}) {
  if (!contactId) {
    throw Object.assign(new Error('A contact id is required to log a call activity'), { statusCode: 400 });
  }

  const api = await dataApi(workspaceId);
  const activityDate = resolveTimestamp(timestamp).toISOString().slice(0, 10);

  const created = await salesforceFetch(workspaceId, `${api}/sobjects/Task`, {
    method: 'POST',
    body: JSON.stringify({
      WhoId: contactId,
      Subject: 'Call logged by Spandan AI Agent',
      Status: 'Completed',
      ActivityDate: activityDate,
      Description: summary || undefined,
      Type: 'Call',
      CallType: direction === 'OUTBOUND' ? 'Outbound' : 'Inbound',
    }),
  });
  if (!created?.id) {
    throw new Error('Salesforce did not return a task id for the call activity');
  }

  logger.info({ workspaceId, contactId, taskId: created.id }, 'Salesforce call activity logged');
  return { id: created.id };
}
