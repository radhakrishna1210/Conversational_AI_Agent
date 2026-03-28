import * as whatsappService from '../services/whatsapp.service.js';
import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { assignNumberFromPool, getNumberHealth } from '../lib/meta.service.js';
import { decryptToken } from '../lib/encryption.js';

export const listNumbers = async (req, res) => {
  const numbers = await whatsappService.listNumbers(req.params.workspaceId);
  res.json(numbers);
};

export const requestOtp = async (req, res) => {
  const { phoneNumber, countryCode } = req.body;
  const number = await whatsappService.requestOtp(req.params.workspaceId, phoneNumber, countryCode);
  res.json({ message: 'OTP sent', number });
};

export const verifyOtp = async (req, res) => {
  const { phoneNumber, otp } = req.body;
  const number = await whatsappService.verifyOtp(req.params.workspaceId, phoneNumber, otp);
  res.json({ message: 'Number verified', number });
};

export const getNumber = async (req, res) => {
  const number = await whatsappService.getNumber(req.params.workspaceId, req.params.numberId);
  res.json(number);
};

export const updateBusinessProfile = async (req, res) => {
  const number = await whatsappService.updateBusinessProfile(
    req.params.workspaceId, req.params.numberId, req.body
  );
  res.json(number);
};

export const deleteNumber = async (req, res) => {
  await whatsappService.deleteNumber(req.params.workspaceId, req.params.numberId);
  res.json({ message: 'Number removed' });
};

// ─── onboardWorkspace ─────────────────────────────────────────────────────────

export const onboardWorkspace = async (req, res) => {
  const { workspaceId } = req.params;

  if (req.workspace.numberAssigned) {
    return res.status(409).json({ error: 'This workspace already has a WhatsApp number assigned' });
  }

  // Numbers are pre-loaded under the platform WABA — use the pool entry's
  // existing wabaId directly (no sub-WABA creation needed).
  const poolEntry = await prisma.numberPool.findFirst({ where: { status: 'AVAILABLE' } });
  if (!poolEntry) {
    return res.status(503).json({ error: 'No numbers available. Please contact support.' });
  }

  let assigned;
  try {
    assigned = await assignNumberFromPool(workspaceId, poolEntry.wabaId);
  } catch (err) {
    if (err.statusCode === 503) {
      return res.status(503).json({ error: err.message });
    }
    logger.error({ workspaceId, err: err.message }, 'assignNumberFromPool failed');
    return res.status(502).json({ error: 'Could not assign a WhatsApp number. Please try again.' });
  }

  logger.info({ workspaceId, phoneNumber: assigned.phoneNumber }, 'Workspace onboarded');

  return res.status(201).json({
    success: true,
    phoneNumber: assigned.phoneNumber,
    displayName: assigned.displayName ?? assigned.phoneNumber,
  });
};

// ─── getNumberStatus ──────────────────────────────────────────────────────────

export const getNumberStatus = async (req, res) => {
  const { workspaceId } = req.params;

  const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId } });

  if (!number) {
    return res.status(404).json({ error: 'No WhatsApp number assigned to this workspace' });
  }

  // Without credentials we can only return what is in the DB
  if (!number.accessToken || !number.metaPhoneNumberId) {
    return res.json({
      phoneNumber: number.phoneNumber,
      displayName: number.displayName,
      qualityRating: number.qualityRating ?? '',
      messagingLimit: number.messagingLimit ?? '',
      status: number.status,
      metaError: false,
    });
  }

  // Decrypt stored token — configuration error if this fails
  let plainToken;
  try {
    plainToken = decryptToken(number.accessToken);
  } catch (err) {
    logger.error({ workspaceId, err: err.message }, 'Failed to decrypt access token');
    return res.status(500).json({ error: 'Internal configuration error' });
  }

  // Live health check — fall back to DB values if Meta is unreachable
  try {
    const health = await getNumberHealth(number.metaPhoneNumberId, plainToken);

    await prisma.whatsappNumber.update({
      where: { id: number.id },
      data: {
        qualityRating: health.qualityRating,
        messagingLimit: health.messagingLimit,
        status: health.status || number.status,
      },
    });

    return res.json({
      phoneNumber: number.phoneNumber,
      displayName: health.displayName || number.displayName,
      qualityRating: health.qualityRating,
      messagingLimit: health.messagingLimit,
      status: health.status || number.status,
      metaError: false,
    });
  } catch (err) {
    logger.warn({ workspaceId, err: err.message }, 'Meta health check failed — returning DB values');
    return res.json({
      phoneNumber: number.phoneNumber,
      displayName: number.displayName,
      qualityRating: number.qualityRating ?? '',
      messagingLimit: number.messagingLimit ?? '',
      status: number.status,
      metaError: true,
    });
  }
};
