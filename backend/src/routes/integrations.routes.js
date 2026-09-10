import { Router } from 'express';
import * as ctrl from '../controllers/integrations.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { integrationConnectSchema, integrationCustomApiSchema, integrationProviderParamSchema, integrationSettingsSchema } from '../validators/integrations.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getDashboard);
router.get('/logs', ctrl.getLogs);
router.get('/events', ctrl.events);
router.get('/providers', ctrl.getProviders);
// Spreadsheet picker for the Post-Call tab's Google Sheets delivery target.
// Declared before '/:provider' for clarity (two path segments, so it could not
// be shadowed by the single-segment route regardless).
router.get('/google_sheets/spreadsheets', ctrl.listGoogleSpreadsheets);
router.post('/google_sheets/spreadsheets', authorize('Member'), ctrl.createGoogleSpreadsheet);
router.get('/google_sheets/spreadsheets/:spreadsheetId', ctrl.getGoogleSpreadsheetMetadata);
router.get('/google_sheets/spreadsheets/:spreadsheetId/values', ctrl.readGoogleSheetRange);
// Google Calendar CRUD + availability, and Google Meet event creation — an
// internal verification/integration surface (no dedicated frontend yet),
// same reasoning as the google_sheets/spreadsheets routes above.
router.get('/google_calendar/events', ctrl.listGoogleCalendarEvents);
router.get('/google_calendar/events/:eventId', ctrl.getGoogleCalendarEvent);
router.patch('/google_calendar/events/:eventId', authorize('Member'), ctrl.updateGoogleCalendarEvent);
router.delete('/google_calendar/events/:eventId', authorize('Member'), ctrl.deleteGoogleCalendarEvent);
router.post('/google_calendar/availability', ctrl.checkGoogleCalendarAvailability);
router.post('/google_meet/events', authorize('Member'), ctrl.createGoogleMeetEvent);
router.get('/:provider', validate(integrationProviderParamSchema, 'params'), ctrl.getIntegration);
router.post('/:provider/connect', validate(integrationProviderParamSchema, 'params'), validate(integrationConnectSchema), ctrl.connect);
router.post('/:provider/connect-token', validate(integrationProviderParamSchema, 'params'), ctrl.connectWithToken);
router.post('/:provider/disconnect', validate(integrationProviderParamSchema, 'params'), ctrl.disconnect);
router.patch('/:provider/settings', authorize('Member'), validate(integrationProviderParamSchema, 'params'), validate(integrationSettingsSchema), ctrl.saveSettings);
router.post('/:provider/sync', validate(integrationProviderParamSchema, 'params'), ctrl.sync);
router.post('/custom-api/test', authorize('Member'), validate(integrationCustomApiSchema), ctrl.testCustomApi);

export default router;
