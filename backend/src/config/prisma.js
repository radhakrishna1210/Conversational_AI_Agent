import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const globalThis_ = globalThis;

const ALL_JSON_KEYS = new Set([
  'subscribedEvents',
  'buttons',
  'tags',
  'customFields',
  'variableMapping',
  'templateVars',
  'flowJson',
  'businessHoursJson',
]);

function parseAll(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(parseAll);
  }
  const res = {};
  for (const [key, value] of Object.entries(obj)) {
    if (ALL_JSON_KEYS.has(key) && typeof value === 'string') {
      try {
        res[key] = JSON.parse(value);
      } catch (err) {
        res[key] = value;
      }
    } else if (value && typeof value === 'object') {
      res[key] = parseAll(value);
    } else {
      res[key] = value;
    }
  }
  return res;
}

function stringifyAll(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(stringifyAll);
  }
  const res = {};
  for (const [key, value] of Object.entries(obj)) {
    if (ALL_JSON_KEYS.has(key) && value !== undefined && typeof value !== 'string') {
      res[key] = JSON.stringify(value);
    } else if (value && typeof value === 'object') {
      res[key] = stringifyAll(value);
    } else {
      res[key] = value;
    }
  }
  return res;
}

const basePrisma = globalThis_.__prisma ?? new PrismaClient({
  log: env.isDev() ? ['query', 'warn', 'error'] : ['error'],
});

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (args) {
          args = stringifyAll(args);
        }
        const result = await query(args);
        return parseAll(result);
      }
    }
  }
});

if (env.isDev()) globalThis_.__prisma = basePrisma;

export default prisma;
