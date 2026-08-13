import { Router } from 'express';
import * as ctrl from '../controllers/contact.controller.js';
import { authorize } from '../middleware/authorize.js';

const router = Router({ mergeParams: true });

router.get('/', ctrl.listClusters);
// What a set of clusters actually adds up to — deduped, opt-outs removed. Read
// by the campaign modal before anything is dialled.
router.get('/preview', ctrl.previewClusters);
router.post('/preview', ctrl.previewClusters);

router.post('/', authorize('Member'), ctrl.createCluster);

router.get('/:clusterId', ctrl.getCluster);
router.get('/:clusterId/export', ctrl.exportCluster);
router.patch('/:clusterId', authorize('Member'), ctrl.updateCluster);
router.delete('/:clusterId', authorize('Member'), ctrl.deleteCluster);
router.post('/:clusterId/remove', authorize('Member'), ctrl.removeFromCluster);

export default router;
