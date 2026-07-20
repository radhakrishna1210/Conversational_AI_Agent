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
router.get('/:provider', validate(integrationProviderParamSchema, 'params'), ctrl.getIntegration);
router.post('/:provider/connect', validate(integrationProviderParamSchema, 'params'), validate(integrationConnectSchema), ctrl.connect);
router.post('/:provider/connect-token', validate(integrationProviderParamSchema, 'params'), ctrl.connectWithToken);
router.post('/:provider/disconnect', validate(integrationProviderParamSchema, 'params'), ctrl.disconnect);
router.patch('/:provider/settings', authorize('Member'), validate(integrationProviderParamSchema, 'params'), validate(integrationSettingsSchema), ctrl.saveSettings);
router.post('/:provider/sync', validate(integrationProviderParamSchema, 'params'), ctrl.sync);
router.post('/custom-api/test', authorize('Member'), validate(integrationCustomApiSchema), ctrl.testCustomApi);

export default router;
