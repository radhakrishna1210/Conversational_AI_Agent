import prisma from '../config/prisma.js';
import { getPaginationArgs, paginatedResponse } from '../lib/pagination.js';
import { normalisePhone } from '../lib/csvParser.js';

export const listContacts = async (workspaceId, query = {}) => {
  const { take, skip, cursor } = getPaginationArgs(query);
  const page = parseInt(query.page ?? '1', 10);
  const where = { workspaceId };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { phoneNumber: { contains: query.search } },
    ];
  }
  if (query.optedOut !== undefined) where.optedOut = query.optedOut === 'true';

  // Bug fix #4: cursor was being destructured away and never passed to findMany
  const findArgs = { where, take, skip, orderBy: { createdAt: 'desc' } };
  if (cursor) findArgs.cursor = cursor;

  const [data, total] = await prisma.$transaction([
    prisma.contact.findMany(findArgs),
    prisma.contact.count({ where }),
  ]);

  // Bug fix #5: use paginatedResponse so frontend gets totalPages / hasNext
  return paginatedResponse(data, total, take, page);
};

export const getContact = (workspaceId, contactId) =>
  prisma.contact.findFirstOrThrow({ where: { id: contactId, workspaceId } });

export const upsertContact = (workspaceId, { phoneNumber, name, email, tags, customFields }) => {
  const phone = normalisePhone(phoneNumber);
  if (!phone) throw Object.assign(new Error('phoneNumber is required'), { statusCode: 400 });
  return prisma.contact.upsert({
    where: { workspaceId_phoneNumber: { workspaceId, phoneNumber: phone } },
    create: { workspaceId, phoneNumber: phone, name, email, tags: tags ?? [], customFields },
    update: { name, email, tags: tags ?? [], customFields },
  });
};

export const bulkUpsertContacts = async (workspaceId, rows) => {
  // Bug fix #2: batch all phone lookups in one query instead of N findUnique calls
  const validRows = rows
    .map((row) => ({ ...row, _phone: normalisePhone(row.phone ?? row.Phone ?? '') }))
    .filter((row) => row._phone);

  const phones = validRows.map((r) => r._phone);
  const existing = await prisma.contact.findMany({
    where: { workspaceId, phoneNumber: { in: phones } },
    select: { phoneNumber: true },
  });
  const existingSet = new Set(existing.map((c) => c.phoneNumber));

  // Bug fix #3: strip known scalar fields from customFields to avoid duplication
  const KNOWN_FIELDS = new Set(['phone', 'Phone', 'name', 'Name', 'email', 'Email', 'tags', 'Tags']);

  await prisma.$transaction(
    validRows.map((row) => {
      const phone = row._phone;
      const name  = row.name ?? row.Name ?? null;
      const email = row.email ?? row.Email ?? null;
      const tags  = row.tags ? String(row.tags).split(',').map((t) => t.trim()).filter(Boolean) : [];
      const customFields = Object.fromEntries(
        Object.entries(row).filter(([k]) => !KNOWN_FIELDS.has(k) && k !== '_phone')
      );
      return prisma.contact.upsert({
        where: { workspaceId_phoneNumber: { workspaceId, phoneNumber: phone } },
        create: { workspaceId, phoneNumber: phone, name, email, tags, customFields },
        update: { name, email, tags, customFields },
      });
    })
  );

  const created = validRows.filter((r) => !existingSet.has(r._phone)).length;
  const updated = validRows.length - created;
  return { created, updated };
};

export const toggleOptOut = (workspaceId, contactId, optedOut) =>
  prisma.contact.update({
    where: { id: contactId, workspaceId },
    data: { optedOut, optedOutAt: optedOut ? new Date() : null },
  });

export const deleteContact = (workspaceId, contactId) =>
  prisma.contact.delete({ where: { id: contactId, workspaceId } });
