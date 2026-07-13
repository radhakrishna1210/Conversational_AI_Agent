import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import * as verifyCtrl from '../controllers/authVerification.controller.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema, acceptInviteSchema } from '../validators/auth.validator.js';

const router = Router();

// Manual signup now requires email OTP verification (issue #27).
// /register sends the OTP; /verify-otp creates the account.
const authLimiter = rateLimit({ windowMs: 60_000, max: 6, keyPrefix: 'auth-otp' });
router.post('/register', authLimiter, validate(registerSchema), verifyCtrl.requestSignupOtp);
router.post('/verify-otp', authLimiter, verifyCtrl.verifySignupOtp);
router.post('/forgot-password', authLimiter, verifyCtrl.forgotPassword);
router.post('/reset-password', authLimiter, verifyCtrl.resetPassword);
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/refresh', validate(refreshSchema), ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/invite/accept', validate(acceptInviteSchema), ctrl.acceptInvite);
router.get('/me', authenticate, ctrl.me);
router.get('/google', ctrl.googleRedirect);
router.get('/google/callback', ctrl.googleCallback);

export default router;
