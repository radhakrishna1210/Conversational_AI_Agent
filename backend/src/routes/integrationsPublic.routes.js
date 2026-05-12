import { Router } from 'express';
import * as service from '../services/integrations.service.js';

const router = Router();

router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/integrations?provider=${provider}&error=${encodeURIComponent(String(errorDescription ?? error))}`);
  }

  try {
    await service.completeOAuthCallback(provider, String(code ?? ''), String(state ?? ''), req.query.redirect_uri ? String(req.query.redirect_uri) : null);
    return res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/integrations?provider=${provider}&connected=1`);
  } catch (err) {
    return res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/integrations?provider=${provider}&error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/webhooks/:provider', async (req, res) => {
  try {
    await service.handleWebhookEvent(req.params.provider, req.headers, req.body);
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
