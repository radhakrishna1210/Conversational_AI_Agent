import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { MetaApiError } from '../lib/metaApi.js';
import logger from '../lib/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error({ err, url: req.url, method: req.method }, 'Request error');

  // Bug fix #8: Multer file size / type errors
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message });
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // Prisma unique constraint
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = err.meta?.target;
      return res.status(409).json({ error: `Duplicate value for: ${fields?.join(', ')}` });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
  }

  // Meta API error
  if (err instanceof MetaApiError) {
    return res.status(err.statusCode ?? 502).json({
      error: 'Meta API error',
      message: err.message,
      metaError: err.metaError,
    });
  }

  // Known HTTP errors
  if (err.statusCode || err.status) {
    const status = err.statusCode ?? err.status;
    return res.status(status).json({ error: err.message });
  }

  // Unknown error
  res.status(500).json({ error: 'Internal server error' });
};
