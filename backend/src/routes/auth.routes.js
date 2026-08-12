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
// Separate buckets per step. A single shared 'auth-otp' bucket meant one signup
// (register + a mistyped code + a resend) burned most of a 6/minute allowance
// and locked the user out of the *next* step of their own signup — the entering
// of the code they had just been emailed. Sending mail is the expensive, abusable
// action, so it stays tight; verifying a code the user already holds does not.
const sendLimiter   = rateLimit({ windowMs: 60_000, max: 5,  keyPrefix: 'auth-otp-send' });
const verifyLimiter = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: 'auth-otp-verify' });
router.post('/register', sendLimiter, validate(registerSchema), verifyCtrl.requestSignupOtp);
router.post('/verify-otp', verifyLimiter, verifyCtrl.verifySignupOtp);
router.post('/forgot-password', sendLimiter, verifyCtrl.forgotPassword);
router.post('/reset-password', verifyLimiter, verifyCtrl.resetPassword);
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/refresh', validate(refreshSchema), ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/invite/accept', validate(acceptInviteSchema), ctrl.acceptInvite);
router.get('/me', authenticate, ctrl.me);
router.get('/google', ctrl.googleRedirect);
router.get('/google/callback', ctrl.googleCallback);

export default router;
