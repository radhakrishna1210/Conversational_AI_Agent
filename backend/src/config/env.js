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
  // Raised from 10 to cover the 1-20MB KB file range RAG is meant for
  // (kbChunking.service.js) — extraction/chunking/embedding all run in a
  // background job, not inside the upload request, so a bigger file no
  // longer risks blocking it or any concurrent live call.
  MAX_FILE_SIZE_MB: parseInt(optional('MAX_FILE_SIZE_MB', '25'), 10),

  // Days a call recording is kept on disk before it is deleted
  // (recordingRetention.service.js). Only the audio goes — the call log,
  // transcript and billing columns are permanent. Set to 0 to keep audio
  // forever, which on the shared VPS means unbounded growth: size it against
  // free disk, not against how long the audio might conceivably be wanted.
  RECORDING_RETENTION_DAYS: parseInt(optional('RECORDING_RETENTION_DAYS', '7'), 10),
  RECORDING_RETENTION_SWEEP_INTERVAL_MS: parseInt(
    optional('RECORDING_RETENTION_SWEEP_INTERVAL_MS', '21600000'), 10, // 6h
  ),

  SUPER_ADMIN_EMAIL: optional('SUPER_ADMIN_EMAIL', ''),

  BCRYPT_SALT_ROUNDS: parseInt(optional('BCRYPT_SALT_ROUNDS', '12'), 10),

  CAMPAIGN_BATCH_SIZE: parseInt(optional('CAMPAIGN_BATCH_SIZE', '50'), 10),
  CAMPAIGN_WORKER_CONCURRENCY: parseInt(optional('CAMPAIGN_WORKER_CONCURRENCY', '2'), 10),

  // ── TRAI / DLT compliance ──────────────────────────────────────────────────
  // off | warn | enforce. Defaults to `warn` on purpose: `enforce` refuses every
  // Indian outbound call from a workspace without a verified PE ID, and no
  // existing workspace has one until it has been onboarded. Run in `warn`, watch
  // the logs, backfill, then flip to `enforce`.
  DLT_COMPLIANCE_MODE: optional('DLT_COMPLIANCE_MODE', 'warn'),
  // Our telemarketer (aggregator) ID, which each client declares in their own
  // DLT portal to bind their Principal Entity to our infrastructure. Shown in
  // the onboarding checklist; leave unset until it is issued.
  PLATFORM_TM_ID: optional('PLATFORM_TM_ID', ''),

  // ── Telephony ──────────────────────────────────────────────────────────────
  // Carrier used when a call's caller ID has no VoiceNumber row to route from.
  // Keep this at TWILIO: India moves to Plivo per-number, not by flipping this,
  // so a mistake here cannot reroute existing traffic. See
  // backend/docs/PLIVO_INTEGRATION.md §9.
  TELEPHONY_PROVIDER_DEFAULT: optional('TELEPHONY_PROVIDER_DEFAULT', 'TWILIO'),

  // Plivo — the India carrier. Twilio cannot legally carry Indian domestic
  // traffic, so this is a compliance requirement, not a cost optimisation.
  // MAIN account credentials: subaccount creation, number assignment and
  // compliance filing all require the main account, never a subaccount.
  // NOTE: the account must be registered in Plivo's INDIA data region — the
  // region is chosen at signup and cannot be changed afterwards.
  // Read via process.env in services/plivo/client.js (same convention as
  // ELEVENLABS_API_KEY / DEEPGRAM_API_KEY); listed here for documentation.
  PLIVO_AUTH_ID: optional('PLIVO_AUTH_ID', ''),
  PLIVO_AUTH_TOKEN: optional('PLIVO_AUTH_TOKEN', ''),
  // Default Plivo voice application attached to rented numbers.
  PLIVO_VOICE_APP_ID: optional('PLIVO_VOICE_APP_ID', ''),
  // Caller ID for calls routed to Plivo that have no VoiceNumber row of their
  // own. Must be a number this account (or subaccount) actually holds.
  PLIVO_FROM_NUMBER: optional('PLIVO_FROM_NUMBER', ''),
  // Plivo fetches call XML from a URL rather than accepting it inline the way
  // Twilio does, so both the conversation and greeting paths need a real HTTP
  // endpoint: controllers/plivo.controller.js. Leave BLANK to derive it from
  // PUBLIC_BACKEND_WS_URL, which is the same server — see
  // telephony/plivo.provider.js#resolveAnswerUrlBase.
  PLIVO_ANSWER_URL: optional('PLIVO_ANSWER_URL', ''),
  // Escape hatch for V3 signature validation on the answer/hangup callbacks.
  // Signatures are computed over the URL byte-for-byte, so one proxy rewriting
  // a trailing slash rejects every genuine call — with the unhelpful symptom
  // that the callee hears silence. Set to 'true' ONLY to confirm that is the
  // cause; the rejection log prints the exact string that was signed.
  PLIVO_SKIP_SIGNATURE_CHECK: optional('PLIVO_SKIP_SIGNATURE_CHECK', ''),
  // Public URL Plivo posts compliance-application status changes to. Must match
  // byte-for-byte what is registered with Plivo — the V3 signature is computed
  // over this exact string, so a trailing slash difference fails validation.
  PLIVO_WEBHOOK_URL: optional('PLIVO_WEBHOOK_URL', ''),

  // Exotel — the second India carrier, kept alongside Plivo rather than
  // replacing it. UL-VNO licensed with the strongest DLT operations, and a
  // self-serve trial, so it is usually the faster route to a live Indian test.
  // Read via process.env in services/telephony/exotel.provider.js; listed here
  // for documentation.
  EXOTEL_API_KEY: optional('EXOTEL_API_KEY', ''),
  EXOTEL_API_TOKEN: optional('EXOTEL_API_TOKEN', ''),
  EXOTEL_SID: optional('EXOTEL_SID', ''),
  // Mumbai (api.in.exotel.com) or Singapore (api.exotel.com). Defaults to
  // Mumbai — India requires call media to stay in-country, so Singapore is the
  // wrong region for the traffic this carrier exists to serve.
  EXOTEL_SUBDOMAIN: optional('EXOTEL_SUBDOMAIN', 'api.in.exotel.com'),
  // ExoPhone (virtual number) used as the caller ID.
  EXOTEL_CALLER_ID: optional('EXOTEL_CALLER_ID', ''),
  // How the call is handed to our bridge. Exotel has no per-call XML either way:
  //   stream  Connect Voice AI — the per-call wss:// URL is a dial parameter.
  //           The default, and the only mode where we control routing end to
  //           end. Must be enabled on the Exotel account (ask them; it is off
  //           by default) — a first call failing with a 400/403 usually means
  //           it is not.
  //   app     The call is pointed at an App (flow) built in the Exotel
  //           dashboard, whose Voicebot applet holds the stream URL. Needs
  //           EXOTEL_APP_ID, and the applet pointed at
  //           <PUBLIC_BACKEND_URL>/api/v1/exotel/voicebot-stream for per-agent
  //           routing.
  EXOTEL_DIAL_MODE: optional('EXOTEL_DIAL_MODE', 'stream'),
  // Required in app mode only.
  EXOTEL_APP_ID: optional('EXOTEL_APP_ID', ''),
  // PCM16 rate on the media socket: 8000 | 16000 | 24000. 24000 matches what
  // the bundled engines emit natively, so nothing is resampled in either
  // direction (the PSTN leg is 8k regardless — this is about our CPU, not
  // audio quality). Anything else falls back to 8000, Exotel's own default.
  EXOTEL_SAMPLE_RATE: optional('EXOTEL_SAMPLE_RATE', '24000'),
  // Outbound frame size in ms. Exotel documents ~100ms and its reference bridge
  // ties short/blasted frames to calls dropping after ~4s, so the default is
  // deliberately conservative; drop it to 20 for lower latency once live calls
  // are proven stable. Any value is rounded down to a 320-byte multiple.
  EXOTEL_FRAME_MS: optional('EXOTEL_FRAME_MS', '100'),
  // Public URL Exotel posts terminal call events to. LEAVE UNSET unless this
  // server's public hostname differs from PUBLIC_BACKEND_WS_URL's — it is
  // derived from that (…/api/v1/exotel/status, with the webhook token attached),
  // because it is the same server and a hand-typed second URL is just somewhere
  // for a typo to hide. Getting it wrong is silent: calls that were never
  // answered stay at INITIATED forever, since HTTP 200 from connect.json means
  // accepted, not connected.
  EXOTEL_STATUS_CALLBACK: optional('EXOTEL_STATUS_CALLBACK', ''),
  // Shared secret appended as ?token=… to the two public Exotel endpoints. A
  // carrier cannot hold a session token, so this is the only authentication
  // available; unset means the endpoints are open.
  EXOTEL_WEBHOOK_TOKEN: optional('EXOTEL_WEBHOOK_TOKEN', ''),
  // Hard ceiling in seconds on a single call, sent as TimeLimit. Exotel caps
  // sessions at 60 minutes anyway; this exists so a bridge that never tears
  // down cannot bill indefinitely. Unset means no limit is sent.
  EXOTEL_TIME_LIMIT_SEC: optional('EXOTEL_TIME_LIMIT_SEC', ''),

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
  // A1: lowered 500 → 300 for snappier bundled xAI turn-taking (every reply pays
  // this pause once the caller stops). Raise if it cuts callers off mid-pause.
  XAI_VOICE_TURN_SILENCE_MS: parseInt(optional('XAI_VOICE_TURN_SILENCE_MS', '300'), 10),
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
  // Live-call ElevenLabs TTS model — quality vs latency. Default
  // eleven_multilingual_v2 = most natural/human voice (incl. Hindi). Set
  // eleven_turbo_v2_5 for a balanced mix, or eleven_flash_v2_5 for lowest
  // latency. Read via process.env in elevenlabs.provider.js.
  ELEVENLABS_TTS_MODEL: optional('ELEVENLABS_TTS_MODEL', 'eleven_multilingual_v2'),
  // A1: bundled ElevenLabs turn-taking. Seconds of caller silence before the
  // agent takes its turn (ElevenLabs `turn.turn_timeout`). Lower = snappier.
  // OPT-IN: sent as a conversation_config_override only when set, and only works
  // if turn overrides are enabled on the shell agent — otherwise ElevenLabs
  // rejects the connection, so it stays unset by default. Read directly via
  // process.env in elevenLabsRealtime.service.js (same convention as the key).
  ELEVENLABS_CONVAI_TURN_TIMEOUT_S: optional('ELEVENLABS_CONVAI_TURN_TIMEOUT_S', ''),

  // Deepgram streaming STT (B3) — optional, lowest-latency real-time
  // transcription for the modular Web Call. When DEEPGRAM_API_KEY is set the
  // modular WS handler streams the caller's audio to Deepgram live and skips
  // batch STT; unset, it falls back to the existing Sarvam/ElevenLabs batch STT.
  // Read directly via process.env in deepgramStream.service.js (same convention
  // as ELEVENLABS_API_KEY); listed here for documentation.
  DEEPGRAM_API_KEY: optional('DEEPGRAM_API_KEY', ''),
  DEEPGRAM_MODEL: optional('DEEPGRAM_MODEL', 'nova-2'),
  // Semantic turn detection: silence (ms) after which Deepgram marks the
  // caller's utterance complete (speech_final) so the modular WS handler can end
  // the turn faster than the client's RMS VAD fallback. Lower = snappier but more
  // likely to cut in on a natural pause; higher = safer. Read in the WS handler.
  DEEPGRAM_ENDPOINTING_MS: parseInt(optional('DEEPGRAM_ENDPOINTING_MS', '300'), 10),

  // True low-latency overlap: when 'true' AND the agent uses an ElevenLabs voice,
  // the modular web-call reply streams LLM tokens into ONE ElevenLabs WebSocket
  // TTS stream, so the agent starts speaking on the first words (ttfa ~0.8-1.2s
  // vs ~1.9s single-call). Off by default — falls back to the proven single-call
  // path if unset or if the WS yields no audio. Read via process.env in
  // agentRuntime.service.js.
  VOICE_TTS_OVERLAP: optional('VOICE_TTS_OVERLAP', 'false'),

  // Groq LLM — ultra-low-latency inference for VOICE turns (much faster TTFT
  // than Gemini flash-lite, no spikes). When GROQ_API_KEY is set, live voice
  // turns use Groq; chat and everything else keep their configured provider.
  // OpenAI-compatible API. Read via process.env in groq.service.js /
  // resolveLlmForAgent.
  GROQ_API_KEY: optional('GROQ_API_KEY', ''),
  GROQ_MODEL: optional('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  GROQ_BASE_URL: optional('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),

  isDev: () => process.env.NODE_ENV !== 'production',
};
