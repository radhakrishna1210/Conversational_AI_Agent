import prisma from '../config/prisma.js';
import { generateApiKey } from '../lib/hash.js';

export const listApiKeys = (workspaceId) =>
  prisma.apiKey.findMany({
    where: { workspaceId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, keyPrefix: true, environment: true, lastUsedAt: true, createdAt: true },
  });

export const createApiKey = async (workspaceId, name, environment = 'live') => {
  const prefix = environment === 'test' ? 'sk_test' : 'sk_live';
  const { raw, hash, prefix: keyPrefix } = generateApiKey(prefix);

  const record = await prisma.apiKey.create({
    data: { workspaceId, name, keyHash: hash, keyPrefix, environment },
  });

  return { ...record, rawKey: raw }; // raw key shown only once
};

export const rotateApiKey = async (workspaceId, keyId) => {
  const existing = await prisma.apiKey.findFirstOrThrow({ where: { id: keyId, workspaceId } });

  const prefix = existing.environment === 'test' ? 'sk_test' : 'sk_live';
  const { raw, hash, prefix: keyPrefix } = generateApiKey(prefix);

  await prisma.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });

  const newKey = await prisma.apiKey.create({
    data: { workspaceId, name: `${existing.name} (rotated)`, keyHash: hash, keyPrefix, environment: existing.environment },
  });

  return { ...newKey, rawKey: raw };
};

export const revokeApiKey = (workspaceId, keyId) =>
  prisma.apiKey.update({
    where: { id: keyId, workspaceId },
    data: { revokedAt: new Date() },
  });
