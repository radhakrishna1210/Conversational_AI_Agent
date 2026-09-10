import * as service from '../services/integrations.service.js';
import { INTEGRATION_PROVIDERS } from '../constants/integrations.js';
import { env } from '../config/env.js';

export const getDashboard = async (req, res) => {
  const data = await service.getIntegrationDashboard(req.params.workspaceId);
  res.json(data);
};

export const getLogs = async (req, res) => {
  const logs = await service.getIntegrationLogs(req.params.workspaceId, req.query.provider || null);
  res.json({ logs });
};

export const getIntegration = async (req, res) => {
  const integration = await service.getIntegration(req.params.workspaceId, req.params.provider);
  res.json(integration);
};

// Returns provider metadata + connect fields for the UI
export const getProviders = async (_req, res) => {
  const providers = Object.values(INTEGRATION_PROVIDERS).map(p => ({
    key: p.key,
    name: p.name,
    category: p.category,
    connectType: p.connectType,
    connectFields: p.connectFields ?? [],
    oauthAvailable: p.oauth
      ? Boolean(env[p.oauth.clientIdEnv] && env[p.oauth.clientSecretEnv])
      : false,
  }));
  res.json({ providers });
};

export const connect = async (req, res) => {
  // The redirect URI is derived ONLY inside createOAuthConnectUrl (per-provider
  // env override, else CLIENT_URL). It must never be built from req.get('host'):
  // the browser reaches us through the Vite proxy with changeOrigin, so the Host
  // header is the backend's, producing a URI that differs from the one the user
  // registered with the provider — an unfixable redirect_uri_mismatch.
  const result = await service.createOAuthConnectUrl(
    req.params.workspaceId,
    req.params.provider,
    req.user?.userId ?? req.user?.id,
  );
  res.json(result);
};

// New: connect using a user-supplied token/key from the UI form
export const connectWithToken = async (req, res) => {
  const { workspaceId, provider } = req.params;
  const credentials = req.body; // { apiKey, accessToken, botToken, webhookUrl, accountSid, authToken, etc. }
  const integration = await service.connectWithCredentials(workspaceId, provider, credentials);
  res.json({ connected: Boolean(integration?.connected), integration });
};

export const disconnect = async (req, res) => {
  const integration = await service.disconnectIntegration(req.params.workspaceId, req.params.provider);
  res.json({ integration, message: 'Integration disconnected' });
};

export const saveSettings = async (req, res) => {
  const integration = await service.saveIntegrationSettings(req.params.workspaceId, req.params.provider, req.body.settings ?? req.body, req.body.enabled ?? true);
  res.json({ integration, message: 'Settings saved' });
};

export const sync = async (req, res) => {
  const job = await service.createSyncJob(req.params.workspaceId, req.params.provider, req.body.jobType ?? 'manual');
  const result = await service.runSyncJob(job.id);
  res.json({ job, result });
};

export const testCustomApi = async (req, res) => {
  const result = await service.testCustomApi(req.params.workspaceId, req.body);
  res.json(result);
};

// GET /workspaces/:workspaceId/integrations/google_sheets/spreadsheets
// Populates the Post-Call tab's "target spreadsheet" dropdown.
export const listGoogleSpreadsheets = async (req, res) => {
  try {
    const { listSpreadsheets } = await import('../services/googleSheets.service.js');
    const spreadsheets = await listSpreadsheets(req.params.workspaceId);
    res.json({ spreadsheets });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not list spreadsheets' });
  }
};

// POST /workspaces/:workspaceId/integrations/google_sheets/spreadsheets { title }
// Creates a spreadsheet so users can set up delivery without leaving the app.
export const createGoogleSpreadsheet = async (req, res) => {
  try {
    const { createSpreadsheet } = await import('../services/googleSheets.service.js');
    const spreadsheet = await createSpreadsheet(req.params.workspaceId, req.body?.title);
    res.status(201).json({ spreadsheet });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not create the spreadsheet' });
  }
};

// GET /workspaces/:workspaceId/integrations/google_sheets/spreadsheets/:spreadsheetId
export const getGoogleSpreadsheetMetadata = async (req, res) => {
  try {
    const { getSpreadsheetMetadata } = await import('../services/googleSheets.service.js');
    const spreadsheet = await getSpreadsheetMetadata(req.params.workspaceId, req.params.spreadsheetId);
    res.json({ spreadsheet });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not fetch spreadsheet metadata' });
  }
};

// GET /workspaces/:workspaceId/integrations/google_sheets/spreadsheets/:spreadsheetId/values?range=Sheet1!A1:D10
export const readGoogleSheetRange = async (req, res) => {
  try {
    const { readRange } = await import('../services/googleSheets.service.js');
    const result = await readRange(req.params.workspaceId, req.params.spreadsheetId, req.query.range);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not read the sheet range' });
  }
};

// GET /workspaces/:workspaceId/integrations/google_calendar/events?calendarId=&timeMin=&timeMax=&maxResults=&query=
export const listGoogleCalendarEvents = async (req, res) => {
  try {
    const { listEvents } = await import('../services/googleCalendar.service.js');
    const { calendarId, timeMin, timeMax, maxResults, query } = req.query;
    const result = await listEvents(req.params.workspaceId, {
      calendarId,
      timeMin,
      timeMax,
      maxResults: maxResults ? Number(maxResults) : undefined,
      query,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not list calendar events' });
  }
};

// GET /workspaces/:workspaceId/integrations/google_calendar/events/:eventId?calendarId=
export const getGoogleCalendarEvent = async (req, res) => {
  try {
    const { getEvent } = await import('../services/googleCalendar.service.js');
    const event = await getEvent(req.params.workspaceId, req.params.eventId, { calendarId: req.query.calendarId });
    res.json({ event });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not fetch the calendar event' });
  }
};

// PATCH /workspaces/:workspaceId/integrations/google_calendar/events/:eventId { calendarId?, start?, end?, ... }
export const updateGoogleCalendarEvent = async (req, res) => {
  try {
    const { updateEvent } = await import('../services/googleCalendar.service.js');
    const { calendarId, ...patch } = req.body ?? {};
    const event = await updateEvent(req.params.workspaceId, req.params.eventId, patch, { calendarId });
    res.json({ event });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not update the calendar event' });
  }
};

// DELETE /workspaces/:workspaceId/integrations/google_calendar/events/:eventId?calendarId=&sendUpdates=
export const deleteGoogleCalendarEvent = async (req, res) => {
  try {
    const { deleteEvent } = await import('../services/googleCalendar.service.js');
    const result = await deleteEvent(req.params.workspaceId, req.params.eventId, {
      calendarId: req.query.calendarId,
      sendUpdates: req.query.sendUpdates,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not delete the calendar event' });
  }
};

// POST /workspaces/:workspaceId/integrations/google_calendar/availability { calendarIds?, timeMin, timeMax, timeZone? }
export const checkGoogleCalendarAvailability = async (req, res) => {
  try {
    const { checkAvailability } = await import('../services/googleCalendar.service.js');
    const { calendars, isFree } = await checkAvailability(req.params.workspaceId, req.body ?? {});
    res.json({
      calendars,
      isFree: Object.fromEntries(Object.keys(calendars).map((calendarId) => [calendarId, isFree(calendarId)])),
    });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not check calendar availability' });
  }
};

// POST /workspaces/:workspaceId/integrations/google_meet/events { start, end?, durationMin?, summary?, ... }
export const createGoogleMeetEvent = async (req, res) => {
  try {
    const { createMeetEvent } = await import('../services/googleMeet.service.js');
    const event = await createMeetEvent(req.params.workspaceId, req.body ?? {});
    res.status(201).json({ event });
  } catch (err) {
    res.status(err.statusCode || 502).json({ error: err.message || 'Could not create the Meet event' });
  }
};

export const events = async (req, res) => {
  const { registerIntegrationClient } = await import('../lib/integrationEvents.js');
  registerIntegrationClient(req.params.workspaceId, res);
};
