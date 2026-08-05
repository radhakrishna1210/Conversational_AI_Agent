export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  // Stopped part-way with recipients still pending — resumable. Set either by
  // the user, or by the dispatcher when the workspace runs out of balance.
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};
