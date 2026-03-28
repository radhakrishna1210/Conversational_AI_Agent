const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback = '') => process.env[key] ?? fallback;

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '4000'), 10),

  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: optional('REDIS_URL', ''),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  META_APP_ID: optional('META_APP_ID'),
  META_APP_SECRET: optional('META_APP_SECRET'),
  META_BUSINESS_ID: optional('META_BUSINESS_ID'),
  META_SYSTEM_USER_TOKEN: optional('META_SYSTEM_USER_TOKEN'),
  META_WEBHOOK_VERIFY_TOKEN: required('META_WEBHOOK_VERIFY_TOKEN'),
  META_API_VERSION: optional('META_API_VERSION', 'v19.0'),

  ENCRYPTION_KEY: optional('ENCRYPTION_KEY'),

  CLIENT_URL: optional('CLIENT_URL', 'http://localhost:5173'),

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET'),

  UPLOAD_DIR: optional('UPLOAD_DIR', 'uploads'),
  MAX_FILE_SIZE_MB: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),
  JSON_BODY_LIMIT: optional('JSON_BODY_LIMIT', '2mb'),

  BCRYPT_SALT_ROUNDS: parseInt(optional('BCRYPT_SALT_ROUNDS', '12'), 10),

  CAMPAIGN_BATCH_SIZE: parseInt(optional('CAMPAIGN_BATCH_SIZE', '50'), 10),
  CAMPAIGN_WORKER_CONCURRENCY: parseInt(optional('CAMPAIGN_WORKER_CONCURRENCY', '2'), 10),

  isDev: () => process.env.NODE_ENV !== 'production',
};
