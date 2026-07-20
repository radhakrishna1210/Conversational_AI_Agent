import { Router } from 'express';
import * as ctrl from '../controllers/whatsapp.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { registerNumberSchema, verifyOtpSchema, businessProfileSchema, connectOwnNumberSchema } from '../validators/whatsapp.validator.js';

const router = Router({ mergeParams: true });

router.post('/onboard', authorize('Member'), ctrl.onboardWorkspace);
router.get('/number/status', ctrl.getNumberStatus);

router.get('/numbers', ctrl.listNumbers);
router.get('/numbers/pool', ctrl.getAvailablePool);
router.post('/numbers/connect-twilio', authorize('Member'), ctrl.connectTwilio);
router.post('/numbers/connect-own', authorize('Member'), validate(connectOwnNumberSchema), ctrl.connectOwnNumber);
router.post('/numbers/request-otp', authorize('Member'), validate(registerNumberSchema), ctrl.requestOtp);
router.post('/numbers/verify-otp', authorize('Member'), validate(verifyOtpSchema), ctrl.verifyOtp);
router.get('/numbers/:numberId', ctrl.getNumber);
router.patch('/numbers/:numberId/profile', authorize('Member'), validate(businessProfileSchema), ctrl.updateBusinessProfile);
router.delete('/numbers/:numberId', authorize('Member'), ctrl.deleteNumber);

export default router;
