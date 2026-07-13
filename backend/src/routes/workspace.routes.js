import { Router } from 'express';
import * as ctrl from '../controllers/workspace.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { inviteMemberSchema, updateMemberRoleSchema, workspaceUpdateSchema } from '../validators/settings.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.getWorkspace);
router.patch('/', authorize('Admin'), validate(workspaceUpdateSchema), ctrl.updateWorkspace);
router.get('/members', ctrl.listMembers);
router.post('/members/invite', authorize('Admin'), validate(inviteMemberSchema), ctrl.inviteMember);
router.patch('/members/:userId/role', authorize('Admin'), validate(updateMemberRoleSchema), ctrl.updateMemberRole);
router.delete('/members/:userId', authorize('Admin'), ctrl.removeMember);

export default router;
