import { Router } from 'express';
import * as ctrl from '../controllers/agent.controller.js';

const router = Router({ mergeParams: true });

router.post('/', ctrl.createAgent);
router.get('/', ctrl.getAgents);
router.get('/health/sarvam', ctrl.checkSarvamHealth);
router.get('/:agentId', ctrl.getAgent);
router.put('/:agentId', ctrl.updateAgent);
router.delete('/:agentId', ctrl.deleteAgent);
router.post('/:agentId/chat', ctrl.chat);

export default router;
