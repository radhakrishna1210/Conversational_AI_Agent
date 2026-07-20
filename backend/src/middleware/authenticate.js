import { verifyAccessToken } from '../lib/jwt.js';
import { hashToken } from '../lib/hash.js';
import prisma from '../config/prisma.js';

const API_KEY_PREFIXES = ['sk_live_', 'sk_test_'];

const isApiKey = (token) => API_KEY_PREFIXES.some((p) => token?.startsWith(p));

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Tokens are accepted ONLY via the Authorization header. Query-string tokens leak
  // through logs, redirects, proxies, and browser history. SSE clients now use
  // fetch-based streaming (see client/src/lib/sseClient.ts) which sends real headers.
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    if (isApiKey(token)) {
      // API key auth
      const keyHash = hashToken(token);
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { workspace: true },
      });

      if (!apiKey || apiKey.revokedAt) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      // Update last used timestamp (fire and forget)
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      req.user = { apiKeyId: apiKey.id, workspaceId: apiKey.workspaceId, role: 'Member' };
      req.authType = 'apikey';
      req.workspace = apiKey.workspace;
    } else {
      // JWT auth
      const payload = verifyAccessToken(token);
      req.user = payload;
      req.authType = 'jwt';
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
