const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback = '') => process.env[key] ?? fallback;

// ── Config sanity (guards against corrupted .env files) ──────────────────────
// A duplicated/mangled .env (e.g. DATABASE_URL redefined as "file:./dev.db",
// or JSON_BODY_LIMIT concatenated with other vars) previously caused confusing
// runtime failures. Validate the critical values up front and fail LOUDLY.
const validatedDatabaseUrl = (() => {
  const url = required('DATABASE_URL');
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      `FATAL: DATABASE_URL is not a Postgres connection string (got "${url.slice(0, 40)}..."). ` +
      `Check backend/.env for duplicate DATABASE_URL definitions (e.g. a leftover "file:./dev.db" dev block) ` +
      `and keep exactly ONE postgresql:// value.`
    );
  }
  return url;
})();

const sanitizedBodyLimit = (() => {
  const raw = optional('JSON_BODY_LIMIT', '2mb');
  if (/^\d+(kb|mb|gb)$/i.test(raw.trim())) return raw.trim();
  console.warn(
    `[env] JSON_BODY_LIMIT="${raw.slice(0, 30)}..." is malformed (corrupted .env line?). Falling back to "2mb".`
  );
  return '2mb';
})();

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '4000'), 10),
  USE_MOCK_AUTH: optional('USE_MOCK_AUTH', 'false'),

  DATABASE_URL: validatedDatabaseUrl,
  REDIS_URL: optional('REDIS_URL', ''),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  META_APP_ID: optional('META_APP_ID'),
  META_APP_SECRET: optional('META_APP_SECRET'),
  META_BUSINESS_ID: optional('META_BUSINESS_ID'),
  META_WABA_ID: optional('META_WABA_ID'),
  META_SYSTEM_USER_TOKEN: optional('META_SYSTEM_USER_TOKEN'),
  META_SYSTEM_USER_ID: optional('META_SYSTEM_USER_ID'),
  META_DISPLAY_NAME: optional('META_DISPLAY_NAME', 'Whabridge'),
  META_WEBHOOK_VERIFY_TOKEN: optional('META_WEBHOOK_VERIFY_TOKEN'),
  META_API_VERSION: optional('META_API_VERSION', 'v19.0'),

  ENCRYPTION_KEY: optional('ENCRYPTION_KEY'),

  JSON_BODY_LIMIT: sanitizedBodyLimit,

  SMTP_HOST: optional('SMTP_HOST'),
  SMTP_PORT: parseInt(optional('SMTP_PORT', '587'), 10),
  SMTP_SECURE: optional('SMTP_SECURE', 'false') === 'true',
  SMTP_USER: optional('SMTP_USER'),
  SMTP_PASSWORD: optional('SMTP_PASSWORD'),
  EMAIL_FROM: optional('EMAIL_FROM'),
  EMAIL_FROM_NAME: optional('EMAIL_FROM_NAME', 'Voice AI Platform'),

  CLIENT_URL: optional('CLIENT_URL', 'http://localhost:5173'),
  CHATFLOW_PRO_URL: optional('CHATFLOW_PRO_URL', 'http://localhost:8080'),

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET'),
  GOOGLE_AUTH_REDIRECT_URI: optional('GOOGLE_AUTH_REDIRECT_URI'),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI'),
  // Per-integration OAuth callbacks. Leave unset in development: the correct
  // per-provider URI is derived from CLIENT_URL. Set these only when the
  // deployed callback host differs from CLIENT_URL.
  GOOGLE_CALENDAR_REDIRECT_URI: optional('GOOGLE_CALENDAR_REDIRECT_URI'),
  GOOGLE_MEET_REDIRECT_URI: optional('GOOGLE_MEET_REDIRECT_URI'),
  GOOGLE_SHEETS_REDIRECT_URI: optional('GOOGLE_SHEETS_REDIRECT_URI'),

  CAL_CLIENT_ID: optional('CAL_CLIENT_ID'),
  CAL_CLIENT_SECRET: optional('CAL_CLIENT_SECRET'),
  CAL_REDIRECT_URI: optional('CAL_REDIRECT_URI'),

  CALENDLY_CLIENT_ID: optional('CALENDLY_CLIENT_ID'),
  CALENDLY_CLIENT_SECRET: optional('CALENDLY_CLIENT_SECRET'),
  CALENDLY_REDIRECT_URI: optional('CALENDLY_REDIRECT_URI'),
  CALENDLY_PERSONAL_TOKEN: optional('CALENDLY_PERSONAL_TOKEN'),
  CALENDLY_WEBHOOK_SIGNING_KEY: optional('CALENDLY_WEBHOOK_SIGNING_KEY'),

  SALESFORCE_CLIENT_ID: optional('SALESFORCE_CLIENT_ID'),
  SALESFORCE_CLIENT_SECRET: optional('SALESFORCE_CLIENT_SECRET'),
  SALESFORCE_REDIRECT_URI: optional('SALESFORCE_REDIRECT_URI'),

  SLACK_CLIENT_ID: optional('SLACK_CLIENT_ID'),
  SLACK_CLIENT_SECRET: optional('SLACK_CLIENT_SECRET'),
  SLACK_REDIRECT_URI: optional('SLACK_REDIRECT_URI'),
  SLACK_SIGNING_SECRET: optional('SLACK_SIGNING_SECRET'),

  HUBSPOT_CLIENT_ID: optional('HUBSPOT_CLIENT_ID'),
  HUBSPOT_CLIENT_SECRET: optional('HUBSPOT_CLIENT_SECRET'),
  HUBSPOT_REDIRECT_URI: optional('HUBSPOT_REDIRECT_URI'),

  GENESYS_CLIENT_ID: optional('GENESYS_CLIENT_ID'),
  GENESYS_CLIENT_SECRET: optional('GENESYS_CLIENT_SECRET'),
  GENESYS_REDIRECT_URI: optional('GENESYS_REDIRECT_URI'),
  GENESYS_REGION: optional('GENESYS_REGION', 'mypurecloud.com'),

  CAL_API_BASE_URL: optional('CAL_API_BASE_URL', 'https://api.cal.com'),
  CALENDLY_API_BASE_URL: optional('CALENDLY_API_BASE_URL', 'https://api.calendly.com'),
  SALESFORCE_INSTANCE_URL: optional('SALESFORCE_INSTANCE_URL'),
  HUBSPOT_API_BASE_URL: optional('HUBSPOT_API_BASE_URL', 'https://api.hubapi.com'),
  GOOGLE_API_BASE_URL: optional('GOOGLE_API_BASE_URL', 'https://www.googleapis.com'),
  SLACK_API_BASE_URL: optional('SLACK_API_BASE_URL', 'https://slack.com/api'),
  GENESYS_API_BASE_URL: optional('GENESYS_API_BASE_URL'),

  UPLOAD_DIR: optional('UPLOAD_DIR', 'uploads'),
  MAX_FILE_SIZE_MB: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),

  SUPER_ADMIN_EMAIL: optional('SUPER_ADMIN_EMAIL', ''),

  BCRYPT_SALT_ROUNDS: parseInt(optional('BCRYPT_SALT_ROUNDS', '12'), 10),

  CAMPAIGN_BATCH_SIZE: parseInt(optional('CAMPAIGN_BATCH_SIZE', '50'), 10),
  CAMPAIGN_WORKER_CONCURRENCY: parseInt(optional('CAMPAIGN_WORKER_CONCURRENCY', '2'), 10),

  // Sarvam AI LLM Configuration
  SARVAM_API_KEY: optional('SARVAM_API_KEY', ''),
  SARVAM_URL: optional('SARVAM_URL', 'https://api.sarvam.ai'),
  SARVAM_MODEL: optional('SARVAM_MODEL', 'sarvam-30b'),

  // xAI Grok Voice Agent — bundled speech-to-speech (STT+LLM+TTS) engine,
  // selectable per-agent as an alternative to the modular pipeline above.
  // XAI_VOICE_WS_URL / model name follow xAI's documented OpenAI-Realtime
  // compatibility; confirm exact values against your xAI account.
  XAI_API_KEY: optional('XAI_API_KEY', ''),
  XAI_VOICE_WS_URL: optional('XAI_VOICE_WS_URL', 'wss://api.x.ai/v1/realtime'),
  XAI_VOICE_MODEL: optional('XAI_VOICE_MODEL', 'grok-voice-latest'),
  XAI_VOICE_NAME: optional('XAI_VOICE_NAME', ''),
  // Server-VAD turn-detection tuning (OpenAI-Realtime compatible fields xAI
  // mirrors). These trade responsiveness against false interruptions:
  //  - SILENCE_MS: how long the caller must pause before their turn is treated
  //    as over. LOWER = snappier replies but more likely to cut people off on a
  //    natural mid-sentence pause; HIGHER = safer but adds that much lag to
  //    every turn. 500ms is a reasonable middle for conversational speech.
  //  - THRESHOLD: VAD speech-probability gate (0..1). Raise in noisy input to
  //    avoid triggering on background noise; lower to catch soft speakers.
  //  - PREFIX_MS: audio kept *before* detected speech so the first word isn't
  //    clipped from the transcript.
  XAI_VOICE_TURN_SILENCE_MS: parseInt(optional('XAI_VOICE_TURN_SILENCE_MS', '500'), 10),
  XAI_VOICE_TURN_THRESHOLD: parseFloat(optional('XAI_VOICE_TURN_THRESHOLD', '0.5')),
  XAI_VOICE_TURN_PREFIX_MS: parseInt(optional('XAI_VOICE_TURN_PREFIX_MS', '300'), 10),
  // Public wss:// origin Twilio can reach to open the media-stream bridge
  // (e.g. your deployed backend domain, or an ngrok/tunnel URL in dev).
  // Two-way bundled-engine phone calls fall back to the old greeting-only
  // stub when unset.
  PUBLIC_BACKEND_WS_URL: optional('PUBLIC_BACKEND_WS_URL', ''),

  // ElevenLabs Conversational AI — second bundled speech-to-speech engine
  // option, alongside xAI above. ELEVENLABS_API_KEY is already used
  // elsewhere in this codebase for TTS (read directly via process.env in
  // elevenLabsRealtime.service.js to match that existing convention).
  // ELEVENLABS_CONVAI_AGENT_ID is a "shell" Agent created once in the
  // ElevenLabs dashboard (Agents Platform) with Prompt/First Message/Language
  // overrides enabled in its Security settings — cannot be created from code.
  ELEVENLABS_CONVAI_AGENT_ID: optional('ELEVENLABS_CONVAI_AGENT_ID', ''),

  // Deepgram streaming STT (B3) — optional, lowest-latency real-time
  // transcription for the modular Web Call. When DEEPGRAM_API_KEY is set the
  // modular WS handler streams the caller's audio to Deepgram live and skips
  // batch STT; unset, it falls back to the existing Sarvam/ElevenLabs batch STT.
  // Read directly via process.env in deepgramStream.service.js (same convention
  // as ELEVENLABS_API_KEY); listed here for documentation.
  DEEPGRAM_API_KEY: optional('DEEPGRAM_API_KEY', ''),
  DEEPGRAM_MODEL: optional('DEEPGRAM_MODEL', 'nova-2'),

  isDev: () => process.env.NODE_ENV !== 'production',
};
