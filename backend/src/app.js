import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './lib/logger.js';

const app = express();

app.use(helmet());

app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Raw body for Meta webhook HMAC verification
app.use('/api/v1/webhook/meta', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

app.use((req, _res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/v1', routes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

export default app;
