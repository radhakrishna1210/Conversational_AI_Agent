import { Router } from 'express';
import * as ctrl from '../controllers/workspace.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { inviteMemberSchema, updateMemberRoleSchema, workspaceUpdateSchema } from '../validators/settings.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getWorkspace);
router.patch('/', authorize('Member'), validate(workspaceUpdateSchema), ctrl.updateWorkspace);
router.get('/members', ctrl.listMembers);
router.post('/members/invite', authorize('Member'), validate(inviteMemberSchema), ctrl.inviteMember);
router.patch('/members/:userId/role', authorize('Member'), validate(updateMemberRoleSchema), ctrl.updateMemberRole);
router.delete('/members/:userId', authorize('Member'), ctrl.removeMember);

export default router;
