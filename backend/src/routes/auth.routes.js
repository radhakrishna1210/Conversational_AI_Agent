import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema, acceptInviteSchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/register', validate(registerSchema), ctrl.register);
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/refresh', validate(refreshSchema), ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/invite/accept', validate(acceptInviteSchema), ctrl.acceptInvite);
router.get('/me', authenticate, ctrl.me);

export default router;
