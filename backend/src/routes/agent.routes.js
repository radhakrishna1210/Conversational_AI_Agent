import { Router } from 'express';
import * as ctrl from '../controllers/agent.controller.js';

const router = Router({ mergeParams: true });

router.post('/test-call', ctrl.testCall);
router.post('/', ctrl.createAgent);
router.get('/', ctrl.getAgents);
router.get('/health/sarvam', ctrl.checkSarvamHealth);
router.get('/:agentId', ctrl.getAgent);
router.put('/:agentId', ctrl.updateAgent);
router.delete('/:agentId', ctrl.deleteAgent);
router.post('/:agentId/chat', ctrl.chat);

// ─── Agent voice assignment ───────────────────────────────────────────────────
import * as voiceCtrl from '../controllers/voice.controller.js';
router.get('/:agentId/voice', voiceCtrl.getVoiceForAgent);
router.put('/:agentId/voice', voiceCtrl.setVoice);

// ─── Conversation runtime (Chat Test + Web Call share this brain) ─────────────
import * as runtimeCtrl from '../controllers/agentRuntime.controller.js';
router.get('/:agentId/welcome', runtimeCtrl.welcome);
router.post('/:agentId/converse', runtimeCtrl.converse);
router.post('/:agentId/speak', runtimeCtrl.speak);
router.post('/:agentId/speak-stream', runtimeCtrl.speakStream);
router.post('/:agentId/voice-turn', runtimeCtrl.uploadVoiceTurnAudio, runtimeCtrl.voiceTurn);

// ─── Interaction history (Recent Calls tab: chat tests, web + phone calls) ────
import * as callLogCtrl from '../controllers/agentCallLog.controller.js';
router.get('/:agentId/calls', callLogCtrl.listCallLogs);
router.post('/:agentId/calls', callLogCtrl.createCallLog);
router.patch('/:agentId/calls/:callId', callLogCtrl.updateCallLog);
router.post('/:agentId/calls/:callId/extract', callLogCtrl.extractCallVariables);
router.post('/:agentId/calls/:callId/recording', callLogCtrl.uploadCallRecording, callLogCtrl.saveCallRecording);
router.get('/:agentId/calls/:callId/recording', callLogCtrl.getCallRecording);

export default router;
