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
 *
 * Token/refresh plumbing lives in googleAuth.service.js, shared with
 * googleCalendar.service.js and googleMeet.service.js.
 */

import logger from '../lib/logger.js';
import { googleFetch, googleRequest, getValidAccessToken as getValidGoogleToken } from './googleAuth.service.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DEFAULT_TAB = 'Call Log';

/**
 * Google answers a bad/inaccessible spreadsheet id with a 404 whose body is
 * just "Requested entity was not found." — technically an error message, but
 * not one that tells a caller what was actually wrong. Every function below
 * that addresses one specific spreadsheet routes its 404 through this so the
 * failure reads the same way Calendar's getEvent() does for a missing event.
 */
function assertSheetsOk(res, data) {
  if (res.status === 404) {
    throw Object.assign(new Error("Spreadsheet not found or you don't have access to it"), { statusCode: 404 });
  }
  if (!res.ok) throw new Error(data?.error?.message || `Google Sheets API ${res.status}`);
}

/**
 * Return a usable access token, transparently refreshing an expired one.
 * Bare-string return kept for backward compatibility with any existing
 * caller — the functions in this file now resolve their own token per call
 * via googleFetch instead of calling this up front.
 */
export const getValidAccessToken = (workspaceId) =>
  getValidGoogleToken(workspaceId, 'google_sheets').then((r) => r.accessToken);

/**
 * List the user's spreadsheets for the Post-Call target dropdown.
 * Ordered most-recently-modified first so a sheet just created shows up top.
 */
export async function listSpreadsheets(workspaceId, { limit = 100 } = {}) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', String(Math.min(limit, 1000)));
  const data = await googleFetch(workspaceId, 'google_sheets', url.toString(), { method: 'GET' });
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
  const data = await googleFetch(workspaceId, 'google_sheets', SHEETS_API, {
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
const getSheetTitles = async (workspaceId, spreadsheetId) => {
  const { res, data } = await googleRequest(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    { method: 'GET' },
  );
  assertSheetsOk(res, data);
  return (data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean);
};

/**
 * Full metadata for one spreadsheet: its name, share URL, and every tab with
 * its dimensions — the "what does this sheet look like" call a caller makes
 * before deciding what range to read or which tab to write into.
 *
 * @param {string} workspaceId
 * @param {string} spreadsheetId
 * @returns {Promise<{id: string, name: string, url: string, tabs: Array<{
 *   title: string, sheetId: number, rowCount: number, columnCount: number
 * }>}>}
 */
export async function getSpreadsheetMetadata(workspaceId, spreadsheetId) {
  const { res, data } = await googleRequest(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,spreadsheetUrl,sheets.properties`,
    { method: 'GET' },
  );
  assertSheetsOk(res, data);
  return {
    id: data.spreadsheetId,
    name: data.properties?.title ?? null,
    url: data.spreadsheetUrl ?? null,
    tabs: (data.sheets ?? []).map((s) => ({
      title: s.properties?.title ?? null,
      sheetId: s.properties?.sheetId ?? null,
      rowCount: s.properties?.gridProperties?.rowCount ?? null,
      columnCount: s.properties?.gridProperties?.columnCount ?? null,
    })),
  };
}

/**
 * Read raw values from an arbitrary range (e.g. "Call Log!A1:F50", or just a
 * tab name for the whole sheet). General-purpose read, independent of the
 * post-call append path below — for a caller that just wants to see what's
 * in a sheet rather than write to it.
 *
 * @param {string} workspaceId
 * @param {string} spreadsheetId
 * @param {string} range A1 notation range or tab name
 * @returns {Promise<{ range: string, values: any[][] }>} values is [] for an
 *   empty range, never undefined — Google omits the field entirely rather
 *   than returning an empty array for a range with no data in it.
 */
export async function readRange(workspaceId, spreadsheetId, range) {
  if (!range || !String(range).trim()) {
    throw Object.assign(new Error('A range is required (e.g. "Sheet1!A1:D10", or a tab name for the whole sheet)'), { statusCode: 400 });
  }
  const { res, data } = await googleRequest(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    { method: 'GET' },
  );
  assertSheetsOk(res, data);
  return { range: data.range ?? range, values: data.values ?? [] };
}

/** Create the target tab when the spreadsheet doesn't have it yet. */
const createSheetTab = (workspaceId, spreadsheetId, title) =>
  googleFetch(workspaceId, 'google_sheets', `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });

/** First row of the tab, used to detect/align an existing header. */
const getHeaderRow = async (workspaceId, spreadsheetId, tab) => {
  const range = `${encodeURIComponent(`${tab}!1:1`)}`;
  const data = await googleFetch(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
    { method: 'GET' },
  );
  return data.values?.[0] ?? [];
};

const writeHeaderRow = (workspaceId, spreadsheetId, tab, headers) =>
  googleFetch(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [headers] }) },
  );

/** 0-based column index → A1 letter(s) (0 → A, 26 → AA). */
const columnLetter = (index) => {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
};

/**
 * 1-based sheet row number of the first data row whose `colIndex` cell equals
 * `value`, or null when no such row exists. Row 1 (the header) is skipped.
 */
const findRowByColumnValue = async (workspaceId, spreadsheetId, tab, colIndex, value) => {
  const col = columnLetter(colIndex);
  const range = encodeURIComponent(`${tab}!${col}:${col}`);
  const data = await googleFetch(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
    { method: 'GET' },
  );
  const values = data.values ?? [];
  for (let i = 1; i < values.length; i++) {
    if ((values[i]?.[0] ?? '') === value) return i + 1; // 1-based row number
  }
  return null;
};

/**
 * Append one call as a row.
 *
 * The header row is the schema: it is written on first use, and afterwards the
 * row is ALIGNED to the existing header rather than appended positionally, so
 * adding or reordering extraction variables later can never shift historical
 * columns out of alignment. Genuinely new variables are appended as new columns.
 *
 * When `record.upsertColumn` is set and its value is present in the row, an
 * existing row carrying the same value in that column is UPDATED in place
 * instead of a duplicate being appended. This makes re-delivery (e.g. a manual
 * "Re-extract") idempotent rather than piling up duplicate rows.
 *
 * @param {string} workspaceId
 * @param {string} spreadsheetId
 * @param {object} record  – { metadata: {label: value}, variables: [{key, value}], upsertColumn?: string }
 * @param {string} [tab]
 */
export async function appendCallRow(workspaceId, spreadsheetId, record, tab = DEFAULT_TAB) {
  if (!spreadsheetId) throw Object.assign(new Error('No spreadsheet selected for Google Sheets delivery'), { statusCode: 400 });

  const titles = await getSheetTitles(workspaceId, spreadsheetId);
  const targetTab = titles.includes(tab) ? tab : (titles.includes(DEFAULT_TAB) ? DEFAULT_TAB : null);
  const sheetTab = targetTab ?? tab;
  if (!targetTab) await createSheetTab(workspaceId, spreadsheetId, sheetTab);

  // Column order: metadata first, then one column per extracted variable.
  const cells = new Map();
  for (const [k, v] of Object.entries(record.metadata ?? {})) cells.set(k, v);
  for (const v of record.variables ?? []) cells.set(v.key, v.value);

  let header = await getHeaderRow(workspaceId, spreadsheetId, sheetTab).catch(() => []);
  if (header.length === 0) {
    header = [...cells.keys()];
    await writeHeaderRow(workspaceId, spreadsheetId, sheetTab, header);
  } else {
    const missing = [...cells.keys()].filter((k) => !header.includes(k));
    if (missing.length) {
      header = [...header, ...missing];
      await writeHeaderRow(workspaceId, spreadsheetId, sheetTab, header);
    }
  }

  const toCell = (v) =>
    v === null || v === undefined ? ''
    : typeof v === 'object' ? JSON.stringify(v)
    : String(v);
  const row = header.map((col) => toCell(cells.get(col)));

  // Idempotent re-delivery: if this record carries an upsert column whose value
  // already exists in the sheet, overwrite that row instead of appending.
  const upsertCol = record.upsertColumn;
  const upsertVal = upsertCol ? cells.get(upsertCol) : undefined;
  if (upsertCol && upsertVal !== undefined && upsertVal !== '') {
    const colIndex = header.indexOf(upsertCol);
    if (colIndex !== -1) {
      const existingRow = await findRowByColumnValue(workspaceId, spreadsheetId, sheetTab, colIndex, toCell(upsertVal));
      if (existingRow) {
        await googleFetch(
          workspaceId, 'google_sheets',
          `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetTab}!A${existingRow}`)}` +
            '?valueInputOption=USER_ENTERED',
          { method: 'PUT', body: JSON.stringify({ values: [row] }) },
        );
        return { spreadsheetId, tab: sheetTab, columns: header.length, updated: true, row: existingRow };
      }
    }
  }

  await googleFetch(
    workspaceId, 'google_sheets',
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetTab}!A1`)}:append` +
      '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );

  return { spreadsheetId, tab: sheetTab, columns: header.length, updated: false };
}
