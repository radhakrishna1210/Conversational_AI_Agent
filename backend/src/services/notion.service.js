// backend/src/services/notion.service.js
/**
 * Notion token access for a connected workspace integration.
 *
 * This is NOT a getValidAccessToken-with-refresh like googleCalendar.service.js
 * or zoho.service.js, and that's deliberate, not an oversight: Notion's OAuth
 * integration tokens do not expire and Notion's token endpoint never issues a
 * refresh_token (see completeOAuthCallback in integrations.service.js, and
 * Notion's own OAuth docs). There is nothing to refresh — the token is valid
 * until the workspace owner revokes it from Notion's own integration settings,
 * at which point every call below starts failing with 401 and the fix is to
 * reconnect, not refresh.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { decryptToken } from '../lib/encryption.js';
import { addLog } from './integrations.service.js';
import logger from '../lib/logger.js';

const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

const notConnected = () =>
  Object.assign(new Error('Notion is not connected for this workspace — connect it on the Integrations page.'), { statusCode: 400 });

/** Return the workspace's Notion access token. Throws if not connected/revoked. */
export async function getValidAccessToken(workspaceId) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'notion' } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected();

  try { return decryptToken(integration.token.accessTokenCipher); }
  catch { throw notConnected(); }
}

/** Every Notion API call needs this; kept in one place so it can't drift. */
export const NOTION_VERSION = '2022-06-28';

export const notionFetch = async (workspaceId, path, init = {}) => {
  const accessToken = await getValidAccessToken(workspaceId);
  return fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
};

/**
 * Which database new call pages get created in. There is no picker UI for
 * this yet (same gap as Google Sheets' spreadsheet picker, minus the picker) —
 * so on first use this auto-discovers the first database the user shared with
 * the integration during Notion's OAuth consent screen, and persists the
 * choice into Integration.settingsJson so every later call reuses the same
 * database instead of re-searching (and so a future picker UI has somewhere
 * to write a deliberate choice instead of this guess).
 *
 * NOTION_DATABASE_ID (env) overrides all of that unconditionally — set it to
 * force an exact database when auto-discovery picked the wrong one out of
 * several shared databases (Notion's search API gives no control over which
 * comes back first). Deliberately NOT written into the cache: .env is already
 * the persistence mechanism for a deliberate choice, and writing an env
 * override into the DB too means a throwaway one-off override (e.g. testing
 * with `NOTION_DATABASE_ID=x node ...` inline, without touching .env)
 * silently and permanently clobbers the real cached value for every run
 * after, including ones with the env var unset.
 */
async function resolveTargetDatabaseId(workspaceId) {
  if (env.NOTION_DATABASE_ID) return env.NOTION_DATABASE_ID;

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'notion' } },
  });
  if (!integration) throw notConnected();

  const settings = safeJson(integration.settingsJson, {});
  if (settings.databaseId) return settings.databaseId;

  const res = await notionFetch(workspaceId, '/v1/search', {
    method: 'POST',
    body: JSON.stringify({ filter: { property: 'object', value: 'database' }, page_size: 1 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Notion database search failed (${res.status})`);
  const databaseId = data.results?.[0]?.id;
  if (!databaseId) {
    throw new Error(
      'No Notion database is shared with this integration. In Notion, open the database you want call records in, '
      + 'click "..." → Connections → add your integration, then try again.',
    );
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { settingsJson: JSON.stringify({ ...settings, databaseId }) },
  });
  return databaseId;
}

/** Notion database property names are user-defined; only the title property's TYPE is fixed. */
async function findTitlePropertyKey(workspaceId, databaseId) {
  const res = await notionFetch(workspaceId, `/v1/databases/${databaseId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Could not read Notion database (${res.status})`);
  const entry = Object.entries(data.properties ?? {}).find(([, v]) => v.type === 'title');
  if (!entry) throw new Error('Notion database has no title property — this should not happen for a valid database.');
  return entry[0];
}

/**
 * Push a completed call as a new page in the workspace's connected Notion
 * database. Fires from deliverPostCall (agentCallLog.controller.js) for any
 * workspace with a connected Notion integration — no per-agent config, no
 * webhook URL, unlike the Zapier/n8n/Make/GHL dispatch path in
 * integrations.service.js.
 *
 * Extracted variables and the transcript go into the page BODY as blocks, not
 * page properties: mapping arbitrary agent-defined variable keys onto a
 * user's own custom database columns with unknown names/types isn't something
 * that can be done generically without a property-mapping UI that doesn't
 * exist yet. Only the title (required by every Notion database) is set.
 */
export async function createPostCallPage(workspaceId, agentId, postCallPayload) {
  const databaseId = await resolveTargetDatabaseId(workspaceId);
  const titleKey = await findTitlePropertyKey(workspaceId, databaseId);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } }).catch(() => null);
  const variables = Array.isArray(postCallPayload.variables) ? postCallPayload.variables : [];
  const pageTitle = `${agent?.name ?? 'Call'} — ${postCallPayload.outcome ?? 'n/a'} — ${postCallPayload.endedAt ?? new Date().toISOString()}`;

  const bulletBlocks = variables.length
    ? variables.map((v) => ({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${v.key}: ${v.value ?? '(not provided)'}` } }] },
      }))
    : [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '(no variables extracted)' } }] } }];

  const body = {
    parent: { database_id: databaseId },
    properties: {
      [titleKey]: { title: [{ text: { content: pageTitle.slice(0, 2000) } }] },
    },
    children: [
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: {
        content: `Phone: ${postCallPayload.phoneNumber || 'n/a'} · Duration: ${postCallPayload.durationSec ?? 0}s · Ended: ${postCallPayload.endedAt ?? 'n/a'}`,
      } }] } },
      { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Extracted variables' } }] } },
      ...bulletBlocks,
      { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Transcript' } }] } },
      // Notion caps rich_text content at 2000 chars per block.
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: (postCallPayload.transcript || '(no transcript)').slice(0, 2000) } }] } },
    ],
  };

  const res = await notionFetch(workspaceId, '/v1/pages', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.message || `HTTP ${res.status}`;
    await addLog({ workspaceId, provider: 'notion', level: 'error', event: 'page_push_failed', message: `Notion page creation failed: ${detail}`, metadata: { callId: postCallPayload.callId } });
    throw new Error(`Notion page creation failed: ${detail}`);
  }

  await addLog({ workspaceId, provider: 'notion', event: 'page_pushed', message: `Notion page created (${data.id})`, metadata: { callId: postCallPayload.callId, pageId: data.id } });
  logger.info({ workspaceId, callId: postCallPayload.callId, pageId: data.id }, 'Notion page created from call');
  return data.id;
}
