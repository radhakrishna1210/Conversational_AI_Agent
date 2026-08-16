// Broadcast lifecycle. Mirrors CAMPAIGN_STATUS deliberately — the two features
// are operated by the same people from the same page furniture, and inventing a
// second vocabulary for the same five states would only make the UI translate.
export const BROADCAST_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  // Stopped part-way with recipients still pending — resumable. Set either by
  // the user, or by the dispatcher when the wallet runs out.
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};

/** Per-dial outcomes. The unit of progress and of billing. */
export const RECIPIENT_STATUS = {
  PENDING: 'pending',
  // Handed to the carrier; the outcome arrives asynchronously on a webhook.
  CALLING: 'calling',
  ANSWERED: 'answered',
  NO_ANSWER: 'no_answer',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};
