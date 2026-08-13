// Contacts and clusters — the address book behind bulk calling.
//
// The unit a campaign dials is a *cluster* (a named list), never a file. A CSV
// uploaded while creating a campaign is imported here first and the campaign is
// then built from the resulting cluster, so every list the workspace has ever
// dialled remains a first-class object it can rename, extend and re-dial.
//
// Two invariants hold everything together:
//   1. One Contact per (workspace, E.164 number). Re-importing updates; it never
//      duplicates a person, and therefore never double-dials one.
//   2. Only ACTIVE contacts are dialable. OPTED_OUT is a promise we made to a
//      person and it outlives the list they were on.

import prisma from '../config/prisma.js';
import logger from '../lib/logger.js';
import { toE164 } from '../lib/phone.js';

export const CONTACT_STATUS = {
  ACTIVE: 'ACTIVE',
  OPTED_OUT: 'OPTED_OUT',
  INVALID: 'INVALID',
};

export const CLUSTER_SOURCE = {
  MANUAL: 'MANUAL',
  CSV_IMPORT: 'CSV_IMPORT',
  CAMPAIGN_CSV: 'CAMPAIGN_CSV',
};

// A single upload is capped so one malformed 2 GB export cannot become a
// half-finished import that nobody can reason about.
const MAX_IMPORT_ROWS = Number(process.env.CONTACT_IMPORT_MAX_ROWS || 50_000);
// Per-row extras kept from a CSV. Wide exports (60+ columns of CRM internals)
// are not worth carrying into every campaign payload.
const MAX_ATTRIBUTES = 30;
const MAX_ATTRIBUTE_LEN = 500;
const CHUNK = 500;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

const chunked = (arr, size = CHUNK) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ── CSV column mapping ──────────────────────────────────────────────────────
// Real uploads say "Mobile No.", "phone_number", "Contact Number". Matching on a
// squashed key means every one of those lands in the right column without
// asking the customer to reformat their export first.

const squash = (key) => String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const PHONE_KEYS = new Set([
  'phone', 'phoneno', 'phonenumber', 'number', 'mobile', 'mobileno', 'mobilenumber',
  'contact', 'contactno', 'contactnumber', 'msisdn', 'cell', 'cellphone', 'cellno',
  'tel', 'telephone', 'whatsapp', 'whatsappnumber', 'primaryphone',
]);
const NAME_KEYS = new Set(['name', 'fullname', 'contactname', 'customername', 'customer', 'clientname', 'person', 'leadname']);
const FIRST_NAME_KEYS = new Set(['firstname', 'fname', 'givenname', 'first']);
const LAST_NAME_KEYS = new Set(['lastname', 'lname', 'surname', 'familyname', 'last']);
const EMAIL_KEYS = new Set(['email', 'emailaddress', 'mail', 'emailid']);
const COMPANY_KEYS = new Set(['company', 'companyname', 'organisation', 'organization', 'org', 'business', 'businessname', 'account', 'accountname']);

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
};

/**
 * Turn one CSV row into a contact draft.
 * Returns null when no dialable number could be read out of it.
 */
export function rowToContactDraft(row) {
  let phoneRaw = null;
  let name = null;
  let firstName = null;
  let lastName = null;
  let email = null;
  let company = null;
  const attributes = {};

  for (const [rawKey, rawValue] of Object.entries(row ?? {})) {
    const key = squash(rawKey);
    const value = clean(rawValue);
    if (!key || value === null) continue;

    if (!phoneRaw && PHONE_KEYS.has(key)) { phoneRaw = value; continue; }
    if (!name && NAME_KEYS.has(key)) { name = value; continue; }
    if (!firstName && FIRST_NAME_KEYS.has(key)) { firstName = value; continue; }
    if (!lastName && LAST_NAME_KEYS.has(key)) { lastName = value; continue; }
    if (!email && EMAIL_KEYS.has(key)) { email = value; continue; }
    if (!company && COMPANY_KEYS.has(key)) { company = value; continue; }

    if (Object.keys(attributes).length < MAX_ATTRIBUTES) {
      attributes[String(rawKey).trim()] = value.slice(0, MAX_ATTRIBUTE_LEN);
    }
  }

  // Header-less files, and exports whose phone column is named something we
  // have never seen: fall back to the first value in the row that parses as a
  // phone number rather than rejecting the whole upload.
  if (!phoneRaw) {
    for (const value of Object.values(row ?? {})) {
      if (toE164(value)) { phoneRaw = value; break; }
    }
  }

  const phoneNumber = toE164(phoneRaw);
  if (!phoneNumber) return null;

  if (!name && (firstName || lastName)) name = [firstName, lastName].filter(Boolean).join(' ');

  return {
    phoneNumber,
    name: name ? name.slice(0, 200) : null,
    email: email ? email.slice(0, 200) : null,
    company: company ? company.slice(0, 200) : null,
    attributes: Object.keys(attributes).length ? attributes : null,
  };
}

// ── Clusters ────────────────────────────────────────────────────────────────

/**
 * A name nobody else in the workspace is using.
 *
 * Cluster names are unique per workspace so the launch-time picker is never a
 * guess between two identical labels. Auto-created lists (campaign CSVs) must
 * not fail on that, so they get a numeric suffix instead of an error.
 */
export async function uniqueClusterName(workspaceId, base, { excludeId = null } = {}) {
  const wanted = (clean(base) || 'Untitled list').slice(0, 120);
  const taken = new Set(
    (await prisma.contactCluster.findMany({
      where: { workspaceId, name: { startsWith: wanted } },
      select: { id: true, name: true },
    }))
      .filter((c) => c.id !== excludeId)
      .map((c) => c.name),
  );
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${wanted} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${wanted} (${Date.now()})`;
}

export async function listClusters(workspaceId) {
  const clusters = await prisma.contactCluster.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true } } },
  });
  if (!clusters.length) return [];

  // Dialable counts in one grouped query rather than one per cluster: the list
  // page renders every cluster, so per-cluster queries would scale with the
  // number of lists a workspace keeps.
  const dialable = await prisma.contactClusterMember.groupBy({
    by: ['clusterId'],
    where: { cluster: { workspaceId }, contact: { status: CONTACT_STATUS.ACTIVE } },
    _count: { _all: true },
  });
  const dialableBy = new Map(dialable.map((d) => [d.clusterId, d._count._all]));

  return clusters.map(({ _count, ...cluster }) => ({
    ...cluster,
    contactCount: _count.members,
    dialableCount: dialableBy.get(cluster.id) ?? 0,
  }));
}

export async function createCluster(workspaceId, { name, description = null, source = CLUSTER_SOURCE.MANUAL, csvFileName = null }) {
  const clean_name = clean(name);
  if (!clean_name) throw badRequest('Cluster name is required');
  const existing = await prisma.contactCluster.findFirst({ where: { workspaceId, name: clean_name } });
  if (existing) throw conflict(`A cluster named "${clean_name}" already exists`);
  return prisma.contactCluster.create({
    data: {
      workspaceId,
      name: clean_name.slice(0, 120),
      description: clean(description),
      source,
      csvFileName,
    },
  });
}

export async function getCluster(workspaceId, clusterId) {
  const cluster = await prisma.contactCluster.findFirst({
    where: { id: clusterId, workspaceId },
    include: { _count: { select: { members: true } } },
  });
  if (!cluster) throw notFound('Cluster not found');
  const { _count, ...rest } = cluster;
  return { ...rest, contactCount: _count.members };
}

export async function updateCluster(workspaceId, clusterId, { name, description }) {
  await getCluster(workspaceId, clusterId);
  const data = {};
  if (name !== undefined) {
    const next = clean(name);
    if (!next) throw badRequest('Cluster name cannot be empty');
    const clash = await prisma.contactCluster.findFirst({
      where: { workspaceId, name: next, NOT: { id: clusterId } },
      select: { id: true },
    });
    if (clash) throw conflict(`A cluster named "${next}" already exists`);
    data.name = next.slice(0, 120);
  }
  if (description !== undefined) data.description = clean(description);
  return prisma.contactCluster.update({ where: { id: clusterId }, data });
}

/**
 * Delete a cluster.
 *
 * `deleteContacts` removes only the members that belong to *no other* cluster.
 * Deleting a list must never silently erase people who are also on someone
 * else's list — that is data loss disguised as tidying up.
 */
export async function deleteCluster(workspaceId, clusterId, { deleteContacts = false } = {}) {
  await getCluster(workspaceId, clusterId);
  let contactsDeleted = 0;

  if (deleteContacts) {
    const members = await prisma.contactClusterMember.findMany({
      where: { clusterId },
      select: { contactId: true },
    });
    const ids = members.map((m) => m.contactId);
    for (const batch of chunked(ids)) {
      const orphans = await prisma.contact.findMany({
        where: { workspaceId, id: { in: batch }, memberships: { every: { clusterId } } },
        select: { id: true },
      });
      if (orphans.length) {
        const { count } = await prisma.contact.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
        contactsDeleted += count;
      }
    }
  }

  await prisma.contactCluster.delete({ where: { id: clusterId } });
  return { deleted: true, contactsDeleted };
}

// ── Contacts ────────────────────────────────────────────────────────────────

const contactWhere = (workspaceId, { search, status, clusterId }) => {
  const where = { workspaceId };
  if (status) where.status = status;
  if (clusterId) where.memberships = { some: { clusterId } };
  const q = clean(search);
  if (q) {
    where.OR = [
      { phoneNumber: { contains: q } },
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
};

export async function listContacts(workspaceId, { search = '', status = '', clusterId = '', page = 1, pageSize = 50 } = {}) {
  const take = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const currentPage = Math.max(Number(page) || 1, 1);
  const where = contactWhere(workspaceId, { search, status, clusterId });

  const [rows, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (currentPage - 1) * take,
      take,
      include: { memberships: { select: { cluster: { select: { id: true, name: true } } } } },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    rows: rows.map(({ memberships, ...c }) => ({
      ...c,
      clusters: memberships.map((m) => m.cluster),
    })),
    total,
    page: currentPage,
    pageSize: take,
  };
}

/** Headline counts for the page header — cheap, and they make opt-outs visible. */
export async function contactSummary(workspaceId) {
  const grouped = await prisma.contact.groupBy({
    by: ['status'],
    where: { workspaceId },
    _count: { _all: true },
  });
  const count = (s) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    total: grouped.reduce((a, g) => a + g._count._all, 0),
    active: count(CONTACT_STATUS.ACTIVE),
    optedOut: count(CONTACT_STATUS.OPTED_OUT),
    invalid: count(CONTACT_STATUS.INVALID),
    clusters: await prisma.contactCluster.count({ where: { workspaceId } }),
  };
}

export async function getContact(workspaceId, contactId) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: { memberships: { select: { cluster: { select: { id: true, name: true } } } } },
  });
  if (!contact) throw notFound('Contact not found');
  const { memberships, ...rest } = contact;
  return { ...rest, clusters: memberships.map((m) => m.cluster) };
}

export async function createContact(workspaceId, { phoneNumber, name, email, company, notes, clusterIds = [] }) {
  const normalized = toE164(phoneNumber);
  if (!normalized) throw badRequest('Enter a valid phone number (for example +91 98765 43210)');

  const existing = await prisma.contact.findFirst({ where: { workspaceId, phoneNumber: normalized } });
  if (existing) throw conflict('That number is already in your contacts');

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      phoneNumber: normalized,
      name: clean(name),
      email: clean(email),
      company: clean(company),
      notes: clean(notes),
    },
  });

  if (clusterIds.length) await addToClusters(workspaceId, [contact.id], clusterIds);
  return getContact(workspaceId, contact.id);
}

export async function updateContact(workspaceId, contactId, { phoneNumber, name, email, company, notes, status }) {
  await getContact(workspaceId, contactId);
  const data = {};

  if (phoneNumber !== undefined) {
    const normalized = toE164(phoneNumber);
    if (!normalized) throw badRequest('Enter a valid phone number');
    const clash = await prisma.contact.findFirst({
      where: { workspaceId, phoneNumber: normalized, NOT: { id: contactId } },
      select: { id: true },
    });
    if (clash) throw conflict('Another contact already has that number');
    data.phoneNumber = normalized;
  }
  if (name !== undefined) data.name = clean(name);
  if (email !== undefined) data.email = clean(email);
  if (company !== undefined) data.company = clean(company);
  if (notes !== undefined) data.notes = clean(notes);
  if (status !== undefined) {
    if (!CONTACT_STATUS[status]) throw badRequest(`Unknown contact status "${status}"`);
    data.status = status;
  }

  await prisma.contact.update({ where: { id: contactId }, data });
  return getContact(workspaceId, contactId);
}

export async function deleteContacts(workspaceId, contactIds) {
  if (!contactIds?.length) throw badRequest('No contacts selected');
  const { count } = await prisma.contact.deleteMany({ where: { workspaceId, id: { in: contactIds } } });
  return { deleted: count };
}

/**
 * Bulk status change — this is the opt-out switch.
 *
 * An opted-out contact stays in its clusters on purpose: removing it would make
 * it re-importable on the next upload, and the whole point is that "stop calling
 * me" survives the next CSV.
 */
export async function setContactStatus(workspaceId, contactIds, status) {
  if (!CONTACT_STATUS[status]) throw badRequest(`Unknown contact status "${status}"`);
  if (!contactIds?.length) throw badRequest('No contacts selected');
  const { count } = await prisma.contact.updateMany({
    where: { workspaceId, id: { in: contactIds } },
    data: { status },
  });
  return { updated: count, status };
}

// ── Membership ──────────────────────────────────────────────────────────────

export async function addToClusters(workspaceId, contactIds, clusterIds) {
  if (!contactIds?.length) throw badRequest('No contacts selected');
  if (!clusterIds?.length) throw badRequest('Pick at least one cluster');

  const clusters = await prisma.contactCluster.findMany({
    where: { workspaceId, id: { in: clusterIds } },
    select: { id: true },
  });
  if (!clusters.length) throw notFound('Cluster not found');

  const owned = await prisma.contact.findMany({
    where: { workspaceId, id: { in: contactIds } },
    select: { id: true },
  });

  let added = 0;
  for (const cluster of clusters) {
    for (const batch of chunked(owned)) {
      const { count } = await prisma.contactClusterMember.createMany({
        data: batch.map((c) => ({ clusterId: cluster.id, contactId: c.id })),
        skipDuplicates: true,
      });
      added += count;
    }
  }
  return { added, clusters: clusters.length, contacts: owned.length };
}

export async function removeFromCluster(workspaceId, clusterId, contactIds) {
  await getCluster(workspaceId, clusterId);
  if (!contactIds?.length) throw badRequest('No contacts selected');
  const { count } = await prisma.contactClusterMember.deleteMany({
    where: { clusterId, contactId: { in: contactIds } },
  });
  return { removed: count };
}

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * Import contact drafts and file them into a cluster.
 *
 * Shared by the Contacts page and by campaign creation, so a CSV behaves
 * identically whichever door it comes through.
 *
 * Merge policy: a non-empty incoming value wins (people re-upload corrected
 * lists and expect the correction to land), a blank one never overwrites, and
 * `attributes` merge key-by-key rather than replacing wholesale.
 */
export async function importContacts(workspaceId, rows, {
  clusterId = null,
  clusterName = null,
  source = CLUSTER_SOURCE.CSV_IMPORT,
  csvFileName = null,
  description = null,
} = {}) {
  if (!Array.isArray(rows)) throw badRequest('No rows to import');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw badRequest(`That file has ${rows.length.toLocaleString()} rows — the limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import`);
  }

  // 1 · Parse and dedupe within the file itself.
  const drafts = new Map();
  const invalidSamples = [];
  let invalid = 0;
  let duplicatesInFile = 0;

  rows.forEach((row, index) => {
    const draft = rowToContactDraft(row);
    if (!draft) {
      invalid += 1;
      if (invalidSamples.length < 5) {
        const shown = Object.values(row ?? {}).filter(Boolean).slice(0, 3).join(', ');
        invalidSamples.push(`row ${index + 2}: ${shown || '(empty)'}`);
      }
      return;
    }
    if (drafts.has(draft.phoneNumber)) {
      duplicatesInFile += 1;
      // Later rows fill blanks left by earlier ones — two half-complete rows for
      // the same person should compose, not fight.
      const prev = drafts.get(draft.phoneNumber);
      drafts.set(draft.phoneNumber, {
        ...prev,
        name: prev.name ?? draft.name,
        email: prev.email ?? draft.email,
        company: prev.company ?? draft.company,
        attributes: (prev.attributes || draft.attributes)
          ? { ...(draft.attributes ?? {}), ...(prev.attributes ?? {}) }
          : null,
      });
      return;
    }
    drafts.set(draft.phoneNumber, draft);
  });

  const list = Array.from(drafts.values());
  if (!list.length) {
    throw badRequest(
      invalid
        ? `No valid phone numbers found — ${invalid} row(s) could not be read. Check the file has a phone column.`
        : 'No valid phone numbers found in that file',
    );
  }

  // 2 · Resolve the destination cluster.
  let cluster;
  if (clusterId) {
    cluster = await prisma.contactCluster.findFirst({ where: { id: clusterId, workspaceId } });
    if (!cluster) throw notFound('Cluster not found');
  } else {
    cluster = await prisma.contactCluster.create({
      data: {
        workspaceId,
        name: await uniqueClusterName(workspaceId, clusterName || csvFileName?.replace(/\.csv$/i, '') || 'Imported list'),
        description: clean(description),
        source,
        csvFileName,
      },
    });
  }

  // 3 · Upsert people, then file them.
  let created = 0;
  let updated = 0;
  let addedToCluster = 0;

  for (const batch of chunked(list)) {
    const phones = batch.map((d) => d.phoneNumber);
    const existing = await prisma.contact.findMany({
      where: { workspaceId, phoneNumber: { in: phones } },
      select: { id: true, phoneNumber: true, name: true, email: true, company: true, attributes: true },
    });
    const byPhone = new Map(existing.map((c) => [c.phoneNumber, c]));

    const fresh = batch.filter((d) => !byPhone.has(d.phoneNumber));
    if (fresh.length) {
      const { count } = await prisma.contact.createMany({
        data: fresh.map((d) => ({ ...d, workspaceId })),
        skipDuplicates: true,
      });
      created += count;
    }

    const patches = [];
    for (const draft of batch) {
      const current = byPhone.get(draft.phoneNumber);
      if (!current) continue;
      const data = {};
      if (draft.name && draft.name !== current.name) data.name = draft.name;
      if (draft.email && draft.email !== current.email) data.email = draft.email;
      if (draft.company && draft.company !== current.company) data.company = draft.company;
      if (draft.attributes) data.attributes = { ...(current.attributes ?? {}), ...draft.attributes };
      if (Object.keys(data).length) patches.push({ id: current.id, data });
    }
    for (const group of chunked(patches, 25)) {
      await Promise.all(group.map((p) =>
        prisma.contact.update({ where: { id: p.id }, data: p.data })
          .catch((e) => logger.warn(`Contact import: could not update ${p.id}: ${e.message}`))));
      updated += group.length;
    }

    // Re-read to pick up the ids createMany does not return.
    const all = await prisma.contact.findMany({
      where: { workspaceId, phoneNumber: { in: phones } },
      select: { id: true },
    });
    const { count } = await prisma.contactClusterMember.createMany({
      data: all.map((c) => ({ clusterId: cluster.id, contactId: c.id })),
      skipDuplicates: true,
    });
    addedToCluster += count;
  }

  const total = await prisma.contactClusterMember.count({ where: { clusterId: cluster.id } });

  logger.info(
    { workspaceId, clusterId: cluster.id, rows: rows.length, created, updated, invalid },
    'Contact import complete',
  );

  return {
    cluster: { ...cluster, contactCount: total },
    summary: {
      rows: rows.length,
      parsed: list.length,
      created,
      updated,
      invalid,
      duplicatesInFile,
      addedToCluster,
      alreadyInCluster: list.length - addedToCluster,
      clusterTotal: total,
      invalidSamples,
    },
  };
}

// ── What a campaign will actually dial ──────────────────────────────────────

/**
 * The dialable contacts behind a set of clusters, deduped across them.
 *
 * Overlapping lists are the norm ("Delhi leads" and "Diwali promo" share half
 * their rows); without the dedupe those people are called twice by one campaign.
 */
export async function resolveClusterContacts(workspaceId, clusterIds) {
  const ids = (clusterIds ?? []).filter(Boolean);
  if (!ids.length) return [];

  const owned = await prisma.contactCluster.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true },
  });
  if (!owned.length) throw notFound('None of those clusters exist in this workspace');

  const members = await prisma.contactClusterMember.findMany({
    where: { clusterId: { in: owned.map((c) => c.id) } },
    select: { contact: { select: { id: true, phoneNumber: true, name: true, status: true } } },
  });

  const byId = new Map();
  for (const m of members) {
    if (m.contact.status !== CONTACT_STATUS.ACTIVE) continue;
    if (!byId.has(m.contact.id)) byId.set(m.contact.id, m.contact);
  }
  return Array.from(byId.values());
}

/** Launch-time honesty: what the chosen clusters add up to, before any dialling. */
export async function previewClusters(workspaceId, clusterIds) {
  const ids = (clusterIds ?? []).filter(Boolean);
  if (!ids.length) return { clusters: 0, rows: 0, unique: 0, dialable: 0, optedOut: 0, invalid: 0, duplicates: 0 };

  const owned = await prisma.contactCluster.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true, name: true },
  });

  const members = await prisma.contactClusterMember.findMany({
    where: { clusterId: { in: owned.map((c) => c.id) } },
    select: { contactId: true, contact: { select: { status: true } } },
  });

  const seen = new Map();
  for (const m of members) if (!seen.has(m.contactId)) seen.set(m.contactId, m.contact.status);
  const statuses = Array.from(seen.values());

  return {
    clusters: owned.length,
    clusterNames: owned.map((c) => c.name),
    rows: members.length,
    unique: seen.size,
    duplicates: members.length - seen.size,
    dialable: statuses.filter((s) => s === CONTACT_STATUS.ACTIVE).length,
    optedOut: statuses.filter((s) => s === CONTACT_STATUS.OPTED_OUT).length,
    invalid: statuses.filter((s) => s === CONTACT_STATUS.INVALID).length,
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

const csvCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Round-trip a cluster back to CSV — the same shape it can be re-imported in. */
export async function exportClusterCsv(workspaceId, clusterId) {
  const cluster = await getCluster(workspaceId, clusterId);
  const members = await prisma.contactClusterMember.findMany({
    where: { clusterId },
    orderBy: { addedAt: 'asc' },
    select: {
      contact: {
        select: {
          phoneNumber: true, name: true, email: true, company: true,
          status: true, notes: true, callCount: true, lastCalledAt: true, attributes: true,
        },
      },
    },
  });

  const extras = [];
  for (const { contact } of members) {
    for (const key of Object.keys(contact.attributes ?? {})) {
      if (extras.length >= 25) break;
      if (!extras.includes(key)) extras.push(key);
    }
  }

  const header = ['phone', 'name', 'email', 'company', 'status', 'notes', 'callCount', 'lastCalledAt', ...extras];
  const lines = [header.map(csvCell).join(',')];
  for (const { contact } of members) {
    lines.push([
      contact.phoneNumber,
      contact.name,
      contact.email,
      contact.company,
      contact.status,
      contact.notes,
      contact.callCount,
      contact.lastCalledAt ? contact.lastCalledAt.toISOString() : '',
      ...extras.map((k) => (contact.attributes ?? {})[k] ?? ''),
    ].map(csvCell).join(','));
  }

  return {
    filename: `${cluster.name.replace(/[^a-z0-9_-]+/gi, '_')}.csv`,
    csv: lines.join('\r\n'),
    rows: members.length,
  };
}
