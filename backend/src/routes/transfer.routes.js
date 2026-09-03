// backend/src/routes/transfer.routes.js
// Carrier callbacks for live human transfers. Public (carriers cannot hold a
// session); every request is authorised by the HMAC token in its URL — see
// transfer.service.js signTransferToken. Twilio and Plivo both POST
// form-encoded bodies.
import { Router } from 'express';
import express from 'express';
import { dialXml, dialStatus, callStatus } from '../controllers/transfer.controller.js';

const router = Router();
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

router.route('/:carrier/xml').get(dialXml).post(dialXml);
router.route('/:carrier/dial').get(dialStatus).post(dialStatus);
router.route('/:carrier/status').get(callStatus).post(callStatus);

export default router;
