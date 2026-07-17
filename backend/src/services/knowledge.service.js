import crypto from 'crypto';
import path from 'path';
import prisma from '../config/prisma.js';
import { chunkText, extractDocumentText } from '../lib/documentParser.js';

const stripExt = (name) => name.replace(/\.[^.]+$/, '');

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const expandTokens = (tokens) => {
  const synonyms = {
    doctors: ['doctor', 'physician', 'specialist', 'consultant', 'staff'],
    doctor: ['doctors', 'physician', 'specialist', 'consultant'],
    physician: ['doctor', 'doctors', 'specialist'],
    specialist: ['doctor', 'physician', 'doctors'],
    available: ['list', 'listings', 'working', 'on-duty', 'schedule'],
    list: ['available', 'directory', 'doctors', 'specialists'],
    appointment: ['booking', 'schedule', 'consultation', 'visit'],
    clinic: ['hospital', 'practice', 'healthcare', 'medical'],
    healthcare: ['clinic', 'hospital', 'medical'],
    department: ['specialty', 'speciality', 'unit', 'ward'],
  };

  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of synonyms[token] || []) {
      expanded.add(synonym);
    }
  }
  return Array.from(expanded);
};

const scoreChunk = (queryTokens, chunk) => {
  if (!queryTokens.length || !chunk) return 0;
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    const count = lower.split(token).length - 1;
    if (count > 0) score += count;
  }

  const phraseBoosts = [
    'doctor',
    'doctors',
    'physician',
    'specialist',
    'specialty',
    'appointment',
    'schedule',
    'clinic',
    'hospital',
    'available',
  ];
  for (const phrase of phraseBoosts) {
    if (lower.includes(phrase)) score += 0.5;
  }
  return score;
};

const looksBroken = (text) => {
  const value = String(text || '').trim();
  if (!value) return true;
  const letters = (value.match(/[A-Za-z]/g) || []).length;
  const printable = (value.match(/[ -~]/g) || []).length;
  const ratio = printable > 0 ? letters / printable : 0;
  return value.length < 80 || ratio < 0.12 || /ReportLab PDF Library|opensource \(anonymous\)|D:\d{14}/i.test(value);
};

const repairDocumentIfNeeded = async (doc) => {
  if (!doc?.filePath || !looksBroken(doc.contentText)) return doc;
  try {
    const repairedText = await extractDocumentText(doc.filePath, doc.mimeType, doc.fileName);
    if (repairedText && repairedText.length > (doc.contentText?.length || 0)) {
      const chunks = chunkText(repairedText, 1200);
      const updated = await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          contentText: repairedText,
          chunkCount: chunks.length,
          updatedAt: new Date(),
        },
      });
      return updated;
    }
  } catch {
    return doc;
  }
  return doc;
};

const extractDoctorRoster = (text) => {
  const rows = [];
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, ' ');
    const match = normalized.match(
      /^(Dr\.\s*[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+([A-Za-z][A-Za-z\s-]+?)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Mon-Fri|Mon-Sat|Tue & Fri|Wed & Sat|Tue,?\s*Thu,?\s*Sat|Mon,?\s*Wed,?\s*Fri)\s+([0-9:APM\s-]+)$/i
    );
    if (match) {
      rows.push({
        doctor: match[1].trim(),
        specialty: match[2].trim(),
        days: match[3].trim(),
        time: match[4].trim().replace(/\s+/g, ' '),
      });
    }
  }

  return rows;
};

export const listKnowledgeDocuments = async (workspaceId) => {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(docs.map(repairDocumentIfNeeded));
};

export const deleteKnowledgeDocument = async (workspaceId, documentId) => {
  return prisma.knowledgeDocument.deleteMany({
    where: { id: documentId, workspaceId },
  });
};

export const ingestKnowledgeDocument = async (workspaceId, file, titleOverride = '') => {
  const filePath = path.resolve(file.path);
  const fileName = file.originalname || path.basename(filePath);
  const mimeType = file.mimetype || 'application/octet-stream';
  const title = stripExt(titleOverride || fileName);
  const contentText = await extractDocumentText(filePath, mimeType, fileName);
  const chunks = chunkText(contentText, 1200);
  const contentHash = crypto.createHash('sha256').update(`${workspaceId}:${fileName}:${contentText}`).digest('hex');

  const record = await prisma.knowledgeDocument.upsert({
    where: { workspaceId_contentHash: { workspaceId, contentHash } },
    create: {
      workspaceId,
      title,
      fileName,
      mimeType,
      filePath,
      contentText,
      contentHash,
      chunkCount: chunks.length,
      source: 'upload',
    },
    update: {
      title,
      fileName,
      mimeType,
      filePath,
      contentText,
      chunkCount: chunks.length,
      updatedAt: new Date(),
    },
  });

  return {
    document: record,
    chunks,
  };
};

export const findRelevantKnowledge = async (workspaceId, query, limit = 4) => {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const repairedDocs = await Promise.all(docs.map(repairDocumentIfNeeded));

  const queryTokens = expandTokens(tokenize(query));
  const scored = [];
  const doctorQuery = /doctor|doctors|physician|specialist|availability|available|list/i.test(query);

  for (const doc of repairedDocs) {
    if (doctorQuery) {
      const roster = extractDoctorRoster(doc.contentText);
      if (roster.length) {
        scored.push({
          documentId: doc.id,
          title: doc.title,
          fileName: doc.fileName,
          chunk: roster
            .map((row) => `${row.doctor} - ${row.specialty} - ${row.days} - ${row.time}`)
            .join('\n'),
          score: 100 + roster.length,
        });
        continue;
      }
    }

    const chunks = chunkText(doc.contentText, 1200);
    for (const chunk of chunks) {
      const score = scoreChunk(queryTokens, chunk);
      if (score > 0) {
        scored.push({
          documentId: doc.id,
          title: doc.title,
          fileName: doc.fileName,
          chunk,
          score,
        });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || b.chunk.length - a.chunk.length)
    .slice(0, limit);
};

export const getKnowledgeSnapshot = async (workspaceId, limit = 3) => {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  const repairedDocs = await Promise.all(docs.map(repairDocumentIfNeeded));

  return repairedDocs.flatMap((doc) => {
    const roster = extractDoctorRoster(doc.contentText);
    if (roster.length) {
      return [{
        documentId: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        chunk: `Doctor Availability:\n${roster.map((row) => `${row.doctor} - ${row.specialty} - ${row.days} - ${row.time}`).join('\n')}`,
        score: 100,
      }];
    }
    const chunks = chunkText(doc.contentText, 1200);
    return chunks.slice(0, 2).map((chunk, index) => ({
      documentId: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      chunk,
      score: index === 0 ? 1 : 0.75,
    }));
  });
};

export const buildKnowledgeContext = (matches = []) => {
  if (!matches.length) return '(no matching knowledge documents found)';
  return matches
    .map((match, index) => `[#${index + 1}] ${match.title} (${match.fileName})\n${match.chunk}`)
    .join('\n\n---\n\n');
};
