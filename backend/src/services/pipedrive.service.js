// backend/src/services/pipedrive.service.js
/**
 * Pipedrive CRM operations for post-call delivery: sync the caller as a
 * Person, then log the call as an Activity linked to that Person.
 *
 * Scope is Person + Activity only — no Deal/Organization handling, matching
 * salesforce.service.js's Contact + Task scope.
 *
 * Built against API v2 throughout (v1 is deprecated as of 2026-07-29) —
 * see pipedriveAuth.service.js's API_PREFIX. v2 pluralized Person's contact
 * fields into `emails`/`phones` arrays of { value, primary, label }.
 *
 * There is no field on Person marked as an external id usable for upsert,
 * so upsert-by-email below is manual: search by email, then POST (create)
 * or PATCH by id (update) — same shape as the Salesforce Contact upsert.
 *
 * Activity has no documented inbound/outbound field, so call direction is
 * folded into the subject/note text rather than a structured field.
 */

import logger from '../lib/logger.js';
import { resolveTimestamp } from '../lib/dates.js';
import { pipedriveFetch, API_PREFIX } from './pipedriveAuth.service.js';

/**
 * Create-or-update a Person keyed by email.
 *
 * @param {string} workspaceId
 * @param {object} contact
 * @param {string} contact.email    – required; the upsert key
 * @param {string} [contact.phone]
 * @param {string} [contact.firstname]
 * @param {string} [contact.lastname]
 * @returns {Promise<{ id: number, email: string }>}
 */
export async function upsertContact(workspaceId, { email, phone, firstname, lastname } = {}) {
  const trimmedEmail = String(email ?? '').trim();
  if (!trimmedEmail) {
    throw Object.assign(new Error('A contact email is required to sync to Pipedrive'), { statusCode: 400 });
  }

  const searchResult = await pipedriveFetch(
    workspaceId,
    `${API_PREFIX}/persons/search?term=${encodeURIComponent(trimmedEmail)}&fields=email&exact_match=true`,
  );
  const existingId = searchResult?.data?.items?.[0]?.item?.id;

  const name = [firstname, lastname].filter(Boolean).join(' ').trim();
  const fields = {
    emails: [{ value: trimmedEmail, primary: true, label: 'work' }],
    ...(phone ? { phones: [{ value: String(phone).trim(), primary: true, label: 'work' }] } : {}),
  };

  if (existingId) {
    // Name is optional on update, so an existing Person's is left untouched
    // here rather than overwritten with the fallback below.
    if (name) fields.name = name;
    await pipedriveFetch(workspaceId, `${API_PREFIX}/persons/${existingId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
    logger.info({ workspaceId, personId: existingId }, 'Pipedrive person updated');
    return { id: existingId, email: trimmedEmail };
  }

  // Person.name is required on create; 'Unknown' is a deliberate generic
  // placeholder, not an inferred value from the email.
  fields.name = name || 'Unknown';
  const created = await pipedriveFetch(workspaceId, `${API_PREFIX}/persons`, {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  if (!created?.data?.id) {
    throw new Error('Pipedrive did not return a person id for the create');
  }
  logger.info({ workspaceId, personId: created.data.id }, 'Pipedrive person created');
  return { id: created.data.id, email: trimmedEmail };
}

/**
 * Log a call as a completed Activity linked to a Person.
 *
 * @param {string} workspaceId
 * @param {number|string} personId
 * @param {object} call
 * @param {string} [call.summary]
 * @param {string} [call.direction] – 'INBOUND' | 'OUTBOUND'; defaults to 'INBOUND'
 * @param {string|Date} [call.timestamp] – defaults to now
 * @returns {Promise<{ id: number }>}
 */
export async function logCallActivity(workspaceId, personId, { summary, direction, timestamp } = {}) {
  if (!personId) {
    throw Object.assign(new Error('A person id is required to log a call activity'), { statusCode: 400 });
  }

  const when = resolveTimestamp(timestamp);
  const dueDate = when.toISOString().slice(0, 10);
  const dueTime = when.toISOString().slice(11, 16);
  const directionLabel = direction === 'OUTBOUND' ? 'Outbound' : 'Inbound';

  const created = await pipedriveFetch(workspaceId, `${API_PREFIX}/activities`, {
    method: 'POST',
    body: JSON.stringify({
      // person_id is read-only on v2 Activities; Pipedrive requires it via
      // participants instead.
      participants: [{ person_id: personId, primary: true }],
      subject: `Call logged by Spandan AI Agent (${directionLabel})`,
      type: 'call',
      due_date: dueDate,
      due_time: dueTime,
      note: summary || undefined,
      done: true,
    }),
  });
  if (!created?.data?.id) {
    throw new Error('Pipedrive did not return an activity id for the call activity');
  }

  logger.info({ workspaceId, personId, activityId: created.data.id }, 'Pipedrive call activity logged');
  return { id: created.data.id };
}
