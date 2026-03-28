import { Router } from 'express';
import * as ctrl from '../controllers/conversation.controller.js';
import * as msgCtrl from '../controllers/message.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { assignAgentSchema, updateConvSchema, sendMessageSchema } from '../validators/conversation.validator.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listConversations);
router.get('/stream', ctrl.streamEvents); // SSE
router.get('/:convId', ctrl.getConversation);
router.patch('/:convId', authorize('Admin', 'Agent'), validate(updateConvSchema), ctrl.updateConversation);
router.patch('/:convId/assign', authorize('Admin', 'Agent'), validate(assignAgentSchema), ctrl.assignAgent);
router.post('/:convId/read', ctrl.markRead);

// Messages nested under conversations
router.get('/:convId/messages', msgCtrl.listMessages);
router.post('/:convId/messages', authorize('Admin', 'Agent'), validate(sendMessageSchema), msgCtrl.sendMessage);

export default router;
