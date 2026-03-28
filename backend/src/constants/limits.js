// Pagination
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MESSAGE_LIST_DEFAULT_LIMIT = 50;
export const MESSAGE_LIST_MAX_LIMIT = 100;
export const CAMPAIGN_PERF_LIST_LIMIT = 10;

// Auth / tokens
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;        // 7 days
export const API_KEY_RANDOM_BYTES = 24;
export const INVITE_TOKEN_BYTES = 24;
export const WEBHOOK_SECRET_BYTES = 20;

// Webhook timeouts
export const WEBHOOK_TEST_TIMEOUT_MS = 5000;
export const WEBHOOK_DISPATCH_TIMEOUT_MS = 10000;

// Server
export const SSE_KEEPALIVE_INTERVAL_MS = 30_000;
export const SHUTDOWN_GRACE_PERIOD_MS = 10_000;

// Queue / workers
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_BACKOFF_DELAY_MS = 5000;

// Validation — field lengths
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;
export const TEMPLATE_BODY_MAX_LENGTH = 1024;
export const TEMPLATE_HEADER_MAX_LENGTH = 60;
export const MESSAGE_BODY_MAX_LENGTH = 4096;
export const MEDIA_CAPTION_MAX_LENGTH = 1024;
export const AUTOMATION_REPLY_MAX_LENGTH = 1024;
export const CAMPAIGN_NAME_MAX_LENGTH = 120;
export const PHONE_NUMBER_MIN_LENGTH = 7;
export const PHONE_NUMBER_MAX_LENGTH = 20;
export const OTP_LENGTH = 6;
export const WHATSAPP_DISPLAY_NAME_MAX_LENGTH = 100;
export const WHATSAPP_DESCRIPTION_MAX_LENGTH = 512;
