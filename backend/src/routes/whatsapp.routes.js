import { Router } from 'express';
import * as ctrl from '../controllers/whatsapp.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { registerNumberSchema, verifyOtpSchema, businessProfileSchema, connectOwnNumberSchema } from '../validators/whatsapp.validator.js';

const router = Router({ mergeParams: true });

router.post('/onboard', authorize('Admin'), ctrl.onboardWorkspace);
router.get('/number/status', ctrl.getNumberStatus);

router.get('/numbers', ctrl.listNumbers);
router.get('/numbers/pool', ctrl.getAvailablePool);
router.post('/numbers/connect-twilio', authorize('Admin'), ctrl.connectTwilio);
router.post('/numbers/connect-own', authorize('Admin'), validate(connectOwnNumberSchema), ctrl.connectOwnNumber);
router.post('/numbers/request-otp', authorize('Admin'), validate(registerNumberSchema), ctrl.requestOtp);
router.post('/numbers/verify-otp', authorize('Admin'), validate(verifyOtpSchema), ctrl.verifyOtp);
router.get('/numbers/:numberId', ctrl.getNumber);
router.patch('/numbers/:numberId/profile', authorize('Admin'), validate(businessProfileSchema), ctrl.updateBusinessProfile);
router.delete('/numbers/:numberId', authorize('Admin'), ctrl.deleteNumber);

export default router;
