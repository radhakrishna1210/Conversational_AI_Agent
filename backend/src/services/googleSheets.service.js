// backend/src/services/googleSheets.service.js
/**
 * Google Sheets delivery for Post-Call results.
 *
 * Uses the workspace's connected `google_sheets` integration to
 *   – list the user's spreadsheets (for the Post-Call target dropdown), and
 *   – append one row per completed call.
 *
 * The OAuth grant carries the `spreadsheets` (read/write) and `drive.readonly`
 * scopes, so appending needs no additional consent.
 */

import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import logger from '../lib/logger.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DEFAULT_TAB = 'Call Log';

/** Access tokens live ~1h; refresh a little early to avoid edge-of-expiry races. */
const EXPIRY_SKEW_MS = 60_000;

const notConnected = () =>
  Object.assign(new Error('Google Sheets is not connected for this workspace — connect it on the Integrations page.'), { statusCode: 400 });

/**
 * Return a usable access token, transparently refreshing an expired one.
 * The stored access token is only ~1h valid, so long-lived agents would
 * otherwise start failing an hour after the integration was connected.
 */
export async function getValidAccessToken(workspaceId) {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'google_sheets' } },
    include: { token: true },
  });
  if (!integration?.token || integration.token.revokedAt) throw notConnected();

  const { token } = integration;
  const stillValid = !token.expiresAt || token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    try { return decryptToken(token.accessTokenCipher); } catch { throw notConnected(); }
  }

  let refreshToken = null;
  try { refreshToken = token.refreshTokenCipher ? decryptToken(token.refreshTokenCipher) : null; } catch { /* treat as absent */ }
  if (!refreshToken) {
    throw Object.assign(
      new Error('Google Sheets access expired and no refresh token is stored — reconnect the integration.'),
      { statusCode: 401 },
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw Object.assign(
      new Error(`Could not refresh Google Sheets access (${detail}) — reconnect the integration.`),
      { statusCode: 401 },
    );
  }

  await prisma.integrationToken.update({
    where: { integrationId: integration.id },
    data: {
      accessTokenCipher: encryptToken(data.access_token),
      // Google omits refresh_token on refresh responses; keep the existing one.
      ...(data.refresh_token ? { refreshTokenCipher: encryptToken(data.refresh_token) } : {}),
      expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    },
  });
  logger.info({ workspaceId }, 'Google Sheets access token refreshed');
  return data.access_token;
}

const googleFetch = async (url, token, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Google API ${res.status}`);
  }
  return body;
};

/**
 * List the user's spreadsheets for the Post-Call target dropdown.
 * Ordered most-recently-modified first so a sheet just created shows up top.
 */
export async function listSpreadsheets(workspaceId, { limit = 100 } = {}) {
  const token = await getValidAccessToken(workspaceId);
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', String(Math.min(limit, 1000)));
  const data = await googleFetch(url.toString(), token);
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    url: f.webViewLink,
  }));
}

/**
 * Create a new spreadsheet in the user's Drive with the call-log tab ready.
 *
 * Uses the Sheets API's create method, which accepts the `spreadsheets` scope
 * already granted — creating this way needs no Drive write permission and so
 * no re-authorization. The file lands in the root of My Drive.
 */
export async function createSpreadsheet(workspaceId, title) {
  const name = String(title ?? '').trim().slice(0, 120) || 'Call Log';
  const token = await getValidAccessToken(workspaceId);
  const data = await googleFetch(SHEETS_API, token, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: name },
      sheets: [{ properties: { title: DEFAULT_TAB } }],
    }),
  });
  logger.info({ workspaceId, spreadsheetId: data.spreadsheetId }, 'Created Google spreadsheet for post-call delivery');
  return {
    id: data.spreadsheetId,
    name: data.properties?.title ?? name,
    url: data.spreadsheetUrl,
  };
}

/** Tab titles present in a spreadsheet. */
const getSheetTitles = async (token, spreadsheetId) => {
  const data = await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    token,
  );
  return (data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
};

/** Create the target tab when the spreadsheet doesn't have it yet. */
const createSheetTab = (token, spreadsheetId, title) =>
  googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });

/** First row of the tab, used to detect/align an existing header. */
const getHeaderRow = async (token, spreadsheetId, tab) => {
  const range = `${encodeURIComponent(`${tab}!1:1`)}`;
  const data = await googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`, token);
  return data.values?.[0] ?? [];
};

const writeHeaderRow = (token, spreadsheetId, tab, headers) =>
  googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`,
    token,
    { method: 'PUT', body: JSON.stringify({ values: [headers] }) },
  );

/**
 * Append one call as a row.
 *
 * The header row is the schema: it is written on first use, and afterwards the
 * row is ALIGNED to the existing header rather than appended positionally, so
 * adding or reordering extraction variables later can never shift historical
 * columns out of alignment. Genuinely new variables are appended as new columns.
 *
 * @param {string} workspaceId
 * @param {string} spreadsheetId
 * @param {object} record  – { metadata: {label: value}, variables: [{key, value}] }
 * @param {string} [tab]
 */
export async function appendCallRow(workspaceId, spreadsheetId, record, tab = DEFAULT_TAB) {
  if (!spreadsheetId) throw Object.assign(new Error('No spreadsheet selected for Google Sheets delivery'), { statusCode: 400 });
  const token = await getValidAccessToken(workspaceId);

  const titles = await getSheetTitles(token, spreadsheetId);
  const targetTab = titles.includes(tab) ? tab : (titles.includes(DEFAULT_TAB) ? DEFAULT_TAB : null);
  const sheetTab = targetTab ?? tab;
  if (!targetTab) await createSheetTab(token, spreadsheetId, sheetTab);

  // Column order: metadata first, then one column per extracted variable.
  const cells = new Map();
  for (const [k, v] of Object.entries(record.metadata ?? {})) cells.set(k, v);
  for (const v of record.variables ?? []) cells.set(v.key, v.value);

  let header = await getHeaderRow(token, spreadsheetId, sheetTab).catch(() => []);
  if (header.length === 0) {
    header = [...cells.keys()];
    await writeHeaderRow(token, spreadsheetId, sheetTab, header);
  } else {
    const missing = [...cells.keys()].filter((k) => !header.includes(k));
    if (missing.length) {
      header = [...header, ...missing];
      await writeHeaderRow(token, spreadsheetId, sheetTab, header);
    }
  }

  const toCell = (v) =>
    v === null || v === undefined ? ''
    : typeof v === 'object' ? JSON.stringify(v)
    : String(v);
  const row = header.map((col) => toCell(cells.get(col)));

  await googleFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetTab}!A1`)}:append` +
      '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    token,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );

  return { spreadsheetId, tab: sheetTab, columns: header.length };
}
