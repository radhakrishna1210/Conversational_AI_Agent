// backend/src/controllers/adminBilling.controller.js
/**
 * Read-only billing HTTP surface for the admin console.
 *
 * The one existing write — manual wallet credit — stays in
 * billing.controller.js next to the rest of the money code, so there is a
 * single place where a balance can be changed.
 */

import logger from '../lib/logger.js';
import * as billing from '../services/adminBilling.service.js';

const handler = (fn, message) => async (req, res) => {
  try {
    const out = await fn(req);
    if (out === null) return res.status(404).json({ error: 'Not found' });
    res.json(out);
  } catch (err) {
    logger.error({ err: err.message }, message);
    res.status(500).json({ error: message });
  }
};

export const getOverview = handler(
  () => billing.getBillingOverview(),
  'Failed to load billing overview',
);

export const listSubscriptions = handler(
  (req) => billing.listSubscriptions(req.query),
  'Failed to load subscriptions',
);

export const listPayments = handler(
  (req) => billing.listPayments(req.query),
  'Failed to load payments',
);

export const listInvoices = handler(
  (req) => billing.listInvoices(req.query),
  'Failed to load invoices',
);

export const listWallets = handler(
  (req) => billing.listWallets(req.query),
  'Failed to load wallets',
);

export const getWalletLedger = handler(
  (req) => billing.getWalletLedger({ workspaceId: req.params.workspaceId, ...req.query }),
  'Failed to load wallet ledger',
);
