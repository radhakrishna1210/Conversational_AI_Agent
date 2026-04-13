import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { addNumberToPoolSchema } from '../validators/admin.validator.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = Router();

// Twilio SMS webhook — public (called by Twilio servers, not by our clients)
// Configure as: POST <backend-url>/api/v1/admin/twilio/sms-webhook on Twilio number
router.post('/twilio/sms-webhook', ctrl.twilioSmsWebhook);

// One-time admin operation: import all Twilio numbers into the pool
router.post('/twilio/sync', authenticate, isAdmin, ctrl.syncTwilioNumbers);

router.post(
  '/numbers/add',
  authenticate,
  isAdmin,
  validate(addNumberToPoolSchema),
  ctrl.addNumberToPool
);

router.get(
  '/numbers/pool',
  authenticate,
  isAdmin,
  ctrl.getNumberPool
);

// One-time endpoint to satisfy Meta app review test call requirements
router.post('/meta/test-calls', authenticate, isAdmin, ctrl.runMetaTestCalls);

// Reset a pool number back to AVAILABLE
router.patch('/numbers/pool/:id/reset', authenticate, isAdmin, ctrl.resetPoolNumber);

// List phone numbers currently in the platform WABA (to get metaPhoneNumberId)
router.get('/waba/numbers', authenticate, isAdmin, ctrl.listWabaNumbers);

// Manual OTP flow: request OTP → admin reads it → verify
router.post('/numbers/request-otp', authenticate, isAdmin, ctrl.requestOtp);
router.post('/numbers/verify-otp',  authenticate, isAdmin, ctrl.verifyOtp);

export default router;
