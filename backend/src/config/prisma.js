import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const globalThis_ = globalThis;

const prisma = globalThis_.__prisma ?? new PrismaClient({
  // Only log queries in dev; suppress warn/error since we handle DB errors in code
  log: env.isDev() ? ['query'] : [],
});

if (env.isDev()) globalThis_.__prisma = prisma;

export default prisma;
