import { Router } from 'express';
import * as ctrl from '../controllers/integrations.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { integrationConnectSchema, integrationCustomApiSchema, integrationProviderParamSchema, integrationSettingsSchema } from '../validators/integrations.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getDashboard);
router.get('/logs', ctrl.getLogs);
router.get('/events', ctrl.events);
router.get('/:provider', validate(integrationProviderParamSchema, 'params'), ctrl.getIntegration);
router.post('/:provider/connect', authorize('Admin'), validate(integrationProviderParamSchema, 'params'), validate(integrationConnectSchema), ctrl.connect);
router.post('/:provider/disconnect', authorize('Admin'), validate(integrationProviderParamSchema, 'params'), ctrl.disconnect);
router.patch('/:provider/settings', authorize('Admin'), validate(integrationProviderParamSchema, 'params'), validate(integrationSettingsSchema), ctrl.saveSettings);
router.post('/:provider/sync', authorize('Admin'), validate(integrationProviderParamSchema, 'params'), ctrl.sync);
router.post('/custom-api/test', authorize('Admin'), validate(integrationCustomApiSchema), ctrl.testCustomApi);

export default router;
