import prisma from '../config/prisma.js';
import { getPaginationArgs } from '../lib/pagination.js';
import { normalisePhone } from '../lib/csvParser.js';

export const listContacts = async (workspaceId, query = {}) => {
  const { take, skip } = getPaginationArgs(query);
  const where = { workspaceId };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { phoneNumber: { contains: query.search } },
    ];
  }
  if (query.optedOut !== undefined) where.optedOut = query.optedOut === 'true';

  const [data, total] = await prisma.$transaction([
    prisma.contact.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
    prisma.contact.count({ where }),
  ]);
  return { data, total };
};

export const getContact = (workspaceId, contactId) =>
  prisma.contact.findFirstOrThrow({ where: { id: contactId, workspaceId } });

export const upsertContact = (workspaceId, { phoneNumber, name, email, tags, customFields }) =>
  prisma.contact.upsert({
    where: { workspaceId_phoneNumber: { workspaceId, phoneNumber: normalisePhone(phoneNumber) } },
    create: { workspaceId, phoneNumber: normalisePhone(phoneNumber), name, email, tags: tags ?? [], customFields },
    update: { name, email, tags: tags ?? [], customFields },
  });

export const bulkUpsertContacts = async (workspaceId, rows) => {
  let created = 0, updated = 0;
  for (const row of rows) {
    if (!row.phone) continue;
    const existing = await prisma.contact.findUnique({
      where: { workspaceId_phoneNumber: { workspaceId, phoneNumber: normalisePhone(row.phone) } },
    });
    await upsertContact(workspaceId, {
      phoneNumber: row.phone,
      name: row.name ?? row.Name ?? null,
      email: row.email ?? row.Email ?? null,
      tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
      customFields: row,
    });
    existing ? updated++ : created++;
  }
  return { created, updated };
};

export const toggleOptOut = async (workspaceId, contactId, optedOut) => {
  return prisma.contact.update({
    where: { id: contactId, workspaceId },
    data: { optedOut, optedOutAt: optedOut ? new Date() : null },
  });
};

export const deleteContact = (workspaceId, contactId) =>
  prisma.contact.delete({ where: { id: contactId, workspaceId } });
