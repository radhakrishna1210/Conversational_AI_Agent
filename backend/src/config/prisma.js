import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const globalThis_ = globalThis;

const prisma = globalThis_.__prisma ?? new PrismaClient({
  log: env.isDev() ? ['query', 'warn', 'error'] : ['error'],
});

if (env.isDev()) globalThis_.__prisma = prisma;

export default prisma;
