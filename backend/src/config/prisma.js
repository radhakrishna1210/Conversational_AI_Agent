import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import logger from '../lib/logger.js';

const globalThis_ = globalThis;

/**
 * The `connection_limit` on a DATABASE_URL, or null when it sets none.
 *
 * Why it is worth a boot-time warning: Prisma runs at most that many queries at
 * once for the WHOLE process, and every query to this deployment's Supabase is a
 * ~490ms round trip. At 1, the three wallet reads that settlement issues together
 * run one after another anyway, and a bulk campaign's dialer, every answered
 * call's wallet gate and every finished call's settlement and extraction queue
 * behind each other — which a caller hears as silence before the greeting.
 * The pooler (port 6543, pgbouncer=true) multiplexes client connections, so a
 * handful per process does not exhaust Supabase's cap; see .env.vps.example.
 */
export function connectionLimitOf(url) {
  const match = /[?&]connection_limit=(\d+)/.exec(String(url || ''));
  return match ? Number(match[1]) : null;
}

if (connectionLimitOf(process.env.DATABASE_URL) === 1) {
  logger.warn(
    'DATABASE_URL has connection_limit=1: every database query in this process runs one at a time. '
    + 'Concurrent phone calls and bulk campaigns will queue behind each other. Use connection_limit=5 '
    + 'on the pooled (6543) connection — see backend/.env.vps.example.',
  );
}

const prisma = globalThis_.__prisma ?? new PrismaClient({
  // Only log queries in dev; suppress warn/error since we handle DB errors in code
  log: env.isDev() ? ['query'] : [],
});

if (env.isDev()) globalThis_.__prisma = prisma;

export default prisma;
