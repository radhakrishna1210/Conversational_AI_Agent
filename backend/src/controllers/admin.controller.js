import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { encryptToken } from '../lib/encryption.js';

// ─── addNumberToPool ──────────────────────────────────────────────────────────

export const addNumberToPool = async (req, res) => {
  const { phoneNumber, phoneNumberId, wabaId, accessToken, displayName } = req.body;

  // Check for duplicate before attempting insert (gives a clearer error than P2002)
  const existing = await prisma.numberPool.findUnique({ where: { phoneNumber } });
  if (existing) {
    return res.status(409).json({ error: `Phone number ${phoneNumber} already exists in the pool` });
  }

  const encryptedToken = encryptToken(accessToken);

  const entry = await prisma.numberPool.create({
    data: {
      phoneNumber,
      phoneNumberId,
      wabaId,
      accessToken: encryptedToken,
      displayName: displayName ?? null,
      status: 'AVAILABLE',
      registeredAt: new Date(),
    },
  });

  logger.info({ adminId: req.user?.id ?? req.user?.userId, phoneNumber }, 'Number added to pool');

  return res.status(201).json({
    success: true,
    id: entry.id,
    phoneNumber: entry.phoneNumber,
    status: entry.status,
  });
};

// ─── getNumberPool ────────────────────────────────────────────────────────────

export const getNumberPool = async (req, res) => {
  const entries = await prisma.numberPool.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const pool = entries.map(({ accessToken: _omit, ...safe }) => safe);

  const summary = {
    total:    entries.length,
    available: entries.filter((e) => e.status === 'AVAILABLE').length,
    assigned:  entries.filter((e) => e.status === 'ASSIGNED').length,
    banned:    entries.filter((e) => e.status === 'BANNED').length,
  };

  logger.info(
    { adminId: req.user?.id ?? req.user?.userId, poolSize: entries.length },
    'Number pool fetched'
  );

  return res.json({ summary, pool });
};
