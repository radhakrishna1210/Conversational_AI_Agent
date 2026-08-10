# Conversational AI Agent

A multi-tenant SaaS platform for building, testing and operating **conversational voice AI agents** — plus a WhatsApp Business channel on the side.

You configure an agent in the browser (persona, welcome message, conversation flow, knowledge base, voice, language), test it live over a WebRTC-style web call, then dial real phone numbers with it — one at a time or as a bulk campaign. Every call is transcribed, logged, analysed post-call, and billed per minute against a wallet.

```
Marketing site → Sign up → Workspace → Build agent → Web call test → Phone call → Bulk campaign
                                          ↑                                            ↓
                                    Knowledge base                             Call logs · Analytics
                                    Integrations                               Wallet · Invoices
```

---

## Table of contents

- [Feature overview](#feature-overview)
- [Architecture](#architecture)
- [The voice pipeline](#the-voice-pipeline)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Database and migrations](#database-and-migrations)
- [Tests](#tests)
- [API surface](#api-surface)
- [Billing model](#billing-model)
- [Admin console](#admin-console)
- [Operational scripts](#operational-scripts)
- [Further documentation](#further-documentation)
- [Troubleshooting](#troubleshooting)

---

## Feature overview

### Voice agents
- **Agent builder** — welcome message, conversational flow, LLM model, voice, languages, max duration, silence timeout, interruption behaviour, ambient background sound.
- **Chat test + Web call** — both driven by one server-side runtime (`agentRuntime.service.js`), so what you hear in the browser is what a caller hears.
- **Two engine families** — bundled speech-to-speech (xAI Grok Voice, ElevenLabs Conversational AI) or a modular STT → LLM → TTS pipeline you assemble yourself. See [The voice pipeline](#the-voice-pipeline).
- **Low-latency streaming** — sentence-split replies, token-streaming TTS over WebSocket, filler acknowledgements while the LLM thinks, barge-in, Deepgram semantic endpointing.
- **Knowledge base** — per-workspace and per-agent file uploads (PDF/text), injected into the prompt in a cache-friendly order so repeated turns hit the provider's prompt cache.
- **Voice cloning** — via Fish Audio or ElevenLabs.
- **Post-call extraction** — structured data pulled out of the transcript after hangup, plus email/webhook delivery.

### Telephony
- **Outbound calls** over Twilio, with the media stream bridged to the agent's realtime session.
- **Bulk voice campaigns** — resumable dispatcher that respects plan concurrency limits, spaces dials, rotates caller IDs, and records every recipient's outcome.
- **Caller-number picker** — verify and call from your own number (Twilio-backed, includes an Airtel verified-calling guide).
- **Call logs** with recordings and transcripts.

### WhatsApp Business
Meta Cloud API integration: numbers, message templates, contacts, conversations, keyword triggers, automation flows, broadcast campaigns and webhooks. The WhaBridge dashboard lives under `/WhaBridge` in the main client.

### Platform
- **Multi-tenant workspaces** with member roles and invites.
- **Auth** — email + OTP verification, password reset, Google OAuth, JWT access/refresh tokens.
- **14 integrations** — Google Calendar / Meet / Sheets, Cal.com, Calendly, Salesforce, HubSpot, Slack, Twilio, Genesys, Make, Zapier, GoHighLevel, and a generic custom API connector. Split into *During Call* and *Post Call* categories.
- **Billing** — wallet, Razorpay top-ups and subscriptions, auto-renewal, invoices, per-minute settlement.
- **Analytics** dashboards, API keys, notifications, issue reporting, appointment booking.
- **Admin console** at `/admin` for the platform operator — cross-tenant users, calls, billing, plans, wallets, numbers, health and an audit trail.

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["client/ — React SPA :5173"]
        Marketing[Marketing site]
        Dash[Workspace dashboard]
        WH[WhaBridge dashboard /WhaBridge]
        Admin[Admin console /admin]
    end

    subgraph Backend["backend/ — Express + ws :4000"]
        API["REST /api/v1"]
        WS["WebSocket upgrades"]
        Runtime[agentRuntime.service]
        Workers["BullMQ workers"]
    end

    subgraph Data
        PG[(PostgreSQL / Prisma)]
        Redis[(Redis — optional)]
    end

    subgraph External["External providers"]
        LLM["LLM — Gemini · OpenAI · Azure · Groq · Sarvam"]
        STT["STT — Deepgram · ElevenLabs · Sarvam"]
        TTS["TTS — ElevenLabs · Fish · Google · Sarvam · Cartesia"]
        Tel["Twilio"]
        Pay["Razorpay"]
        Meta["Meta WhatsApp Cloud API"]
    end

    Client --> API
    Dash -.web call.-> WS
    Tel -.media stream.-> WS
    WS --> Runtime
    API --> Runtime
    Runtime --> LLM & STT & TTS
    API --> PG
    Workers --> Redis
    Workers --> Tel
    API --> Pay & Meta
```

The backend runs a plain `http.Server` wrapping Express so WebSocket upgrades share the same port as REST. Three upgrade paths are routed in `src/server.js`:

| Path | Purpose |
|---|---|
| `/api/v1/workspaces/:wsId/agents/:agentId/xai-call` | Bundled speech-to-speech web call |
| `/api/v1/workspaces/:wsId/agents/:agentId/web-call` | Modular STT+LLM+TTS web call |
| `/api/v1/twilio-media/:wsId/:agentId` | Twilio Media Streams phone bridge |

Background work runs in-process by default (campaign dispatch, integration scheduler, voice sync, subscription renewal sweep). When `REDIS_URL` is set, campaign and contact-import jobs move to BullMQ workers — the dispatcher is written to work either way, because all progress lives in database rows rather than queue state. To run workers as a separate process:

```bash
cd backend && npm run worker
```

---

## The voice pipeline

Two fundamentally different ways to run a conversation, selectable per agent.

### Bundled (speech-to-speech)

One provider owns STT, the LLM and TTS inside a single realtime session. The backend bridges audio between the caller and the provider socket.

| Engine | Env | Phone calls |
|---|---|---|
| **xAI Grok Voice** | `XAI_API_KEY` | Two-way, via Twilio Media Streams |
| **ElevenLabs Conversational AI** | `ELEVENLABS_API_KEY` + `ELEVENLABS_CONVAI_AGENT_ID` | Two-way, via Twilio Media Streams |

### Modular (STT → LLM → TTS)

You pick each stage. More control, cheaper, and the only path with knowledge-base grounding built by our own prompt builder.

| Stage | Providers |
|---|---|
| **STT** | Deepgram (streaming, lowest latency), ElevenLabs Scribe, Sarvam |
| **LLM** | Gemini, OpenAI, Azure OpenAI, Groq, Sarvam, or any OpenAI-compatible endpoint |
| **TTS** | ElevenLabs, Fish Audio, Google Cloud TTS, Sarvam, Cartesia |

> **Phone-call limitation:** a modular agent has no telephony bridge, so a phone call to it plays a **one-way greeting only**. `resolveCallMode()` surfaces this explicitly rather than letting a campaign dial thousands of people expecting a conversation. Use a bundled engine for real two-way phone conversations.

### Latency techniques in play

- **Sentence splitting** (`VOICE_SENTENCE_SPLIT`) — speak sentence 1 while the rest of the reply is still generating.
- **Token-streaming TTS** (`VOICE_TTS_OVERLAP`) — pipe LLM tokens straight into one ElevenLabs/Fish WebSocket so speech starts on the first words (~0.8–1.2 s time-to-first-audio vs ~1.9 s).
- **Fillers** (`VOICE_FILLER_DELAY_MS`) — a short "mm-hmm" if real audio isn't ready in time.
- **Groq for voice turns** (`GROQ_API_KEY`) — much faster time-to-first-token than Gemini flash-lite, with chat traffic left on its configured provider.
- **Deepgram endpointing** (`DEEPGRAM_ENDPOINTING_MS`) — semantic turn detection instead of client-side RMS VAD.
- **Short-TTL runtime caches** — agent row and knowledge base cached for 5 minutes, invalidated immediately on save, so mid-call turns don't pay a remote DB round-trip.
- **Prompt-cache-friendly KB layout** — static knowledge is placed where the provider will actually cache it.

---

## Tech stack

**Backend** — Node.js ≥ 20 (ESM), Express 4, Prisma 5 + PostgreSQL, `ws`, BullMQ + ioredis, JWT (`jsonwebtoken`), bcryptjs, Zod, Pino, Helmet, Multer, pdf-parse.

**Frontend** — React 18, TypeScript 5, Vite 5, Tailwind CSS 3, Radix UI (shadcn/ui), React Router 6, TanStack Query 5, React Hook Form + Zod, Recharts, Framer Motion, Sonner.

---

## Repository layout

```
Conversational_AI_Agent/
├── backend/                     Express API + WebSocket server (:4000)
│   ├── prisma/
│   │   ├── schema.prisma        44 models — workspaces, agents, calls, billing, WhatsApp
│   │   ├── migrations/
│   │   └── seed.js
│   ├── docs/                    Cost model, pricing, Airtel verified-calling guide
│   ├── scripts/                 Latency probes, provider measurement, admin verification
│   └── src/
│       ├── app.js               Express app, CORS, raw-body webhook mounts
│       ├── server.js            HTTP server, WS upgrades, schedulers, shutdown
│       ├── config/              env validation, prisma, redis
│       ├── routes/              27 route modules, mounted in routes/index.js
│       ├── controllers/         36 controllers
│       ├── services/
│       │   ├── agentRuntime.service.js   The conversation "brain"
│       │   ├── voice/           TTS providers, streaming, ambience, disfluency
│       │   ├── stt/             Deepgram streaming, speech gate
│       │   ├── llm/             OpenAI, Azure, custom, mock
│       │   └── billing/         wallet, invoices, Razorpay, subscriptions, settlement
│       ├── ws/                  Three realtime handlers (web call ×2, Twilio media)
│       ├── workers/             BullMQ campaign + contact-import workers
│       └── middleware/          authenticate, authorize, workspaceContext, rate limits
│
├── client/                      Main React SPA (:5173) — marketing, dashboard, admin
│   └── src/
│       ├── pages/               44 pages incl. solutions/ and admin views
│       ├── components/          Layouts, campaign wizard, notifications, ui/ (shadcn)
│       └── services/            Web-call sockets, audio player, ambient sound
│
├── STARTUP.ps1 / STARTUP.bat    Windows convenience bootstrap
├── AUDIT_REPORT.md              Codebase audit
├── BUG_SHEET.md                 Tracked defects
└── TROUBLESHOOTING.md
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | The backend uses `node --env-file` and `node --test`, both Node 20+ features |
| **PostgreSQL** | **Required.** The app refuses to boot on any other `DATABASE_URL` |
| Redis | Optional — enables BullMQ workers; without it, jobs run in-process |
| Provider API keys | Optional — each provider stays dormant until its key is set |

> ⚠️ `backend/.env.example` ships `DATABASE_URL="file:./dev.db"`. That value is a leftover and **will not work** — `src/config/env.js` throws a fatal error unless the URL starts with `postgres://` or `postgresql://`. Point it at a real Postgres instance (local, Supabase, Neon, Railway, RDS…).

---

## Quick start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit — see Configuration below
npm run dev
```

`npm run dev` runs a `predev` hook that executes `prisma generate` and applies pending migrations before starting the watch-mode server on **http://localhost:4000**.

Verify it's alive:

```bash
curl http://localhost:4000/health
```

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Opens on **http://localhost:5173**. Vite proxies `/api` → `localhost:4000` with `ws: true`, so web-call WebSockets work through the dev server without extra config.

### 3. Create an account

Register at `/signup`. Outside production, signup completes without a working SMTP server (`ALLOW_UNVERIFIED_SIGNUP` forces the same behaviour in production if you need it). Alternatively seed a demo workspace:

```bash
cd backend
npm run db:seed        # admin@demo.com / password123
```

### Windows shortcut

`STARTUP.ps1` (or `STARTUP.bat`) from the project root checks Node, installs dependencies, generates the Prisma client and applies migrations. It still asks you to start the two dev servers in separate windows.

---

## Configuration

All backend configuration lives in `backend/.env`, loaded via `node --env-file=.env`. `backend/.env.example` is the annotated reference — it explains the trade-off behind every tuning knob, not just its name.

### Required

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
```

The server starts without anything else. Every optional subsystem fails closed: no key means the feature reports unhealthy and cannot be selected, rather than half-working.

### Commonly set

| Group | Variables |
|---|---|
| **Server** | `NODE_ENV`, `PORT`, `CLIENT_URL`, `JSON_BODY_LIMIT`, `LOG_LEVEL` |
| **Roles** | `SUPER_ADMIN_EMAIL` — the platform owner; authoritative at every login, grants `/admin` |
| **Security** | `ENCRYPTION_KEY` (32 chars, encrypts stored integration tokens), `BCRYPT_SALT_ROUNDS` |
| **Queues** | `REDIS_URL`, `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_WORKER_CONCURRENCY`, `CAMPAIGN_DIAL_SPACING_MS` |
| **LLM** | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY`, `GROQ_API_KEY`, `SARVAM_API_KEY`, `CUSTOM_LLM_BASE_URL` |
| **STT** | `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `DEEPGRAM_ENDPOINTING_MS` |
| **TTS / voice** | `ELEVENLABS_API_KEY`, `ELEVENLABS_TTS_MODEL`, `FISH_API_KEY`, `CARTESIA_API_KEY`, `GOOGLE_TTS_CREDENTIALS_JSON`, `VOICE_CLONE_PROVIDER` |
| **Realtime engines** | `XAI_API_KEY`, `ELEVENLABS_CONVAI_AGENT_ID`, `PUBLIC_BACKEND_WS_URL` |
| **Telephony** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| **Billing** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BILLING_CURRENCY`, `FX_USD_TO_INR`, `BILLING_INCREMENT_SEC` |
| **WhatsApp** | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_API_VERSION` |
| **Email** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` |
| **Integrations** | `<PROVIDER>_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` for Google, Cal, Calendly, Salesforce, HubSpot, Slack, Genesys |
| **Latency tuning** | `VOICE_SENTENCE_SPLIT`, `VOICE_TTS_OVERLAP`, `VOICE_FILLER_DELAY_MS`, `VOICE_MAX_BREAK_MS`, `ELEVENLABS_STREAMING_LATENCY` |
| **Calls** | `APPOINTMENT_TIMEZONE`, `STALE_CALL_MS`, `AMBIENCE_PHONE_ENABLED` |

`PUBLIC_BACKEND_WS_URL` matters for phone calls: Twilio needs a publicly reachable `wss://` origin to open the media-stream bridge. In development that means a tunnel (ngrok or similar). Without it, two-way bundled-engine phone calls fall back to a greeting-only stub.

### Frontend

`client/.env`:

```env
VITE_API_URL=http://localhost:4000
```

---

## Database and migrations

Prisma with PostgreSQL. 44 models covering workspaces and membership, agents and call logs, WhatsApp (numbers, templates, contacts, campaigns, conversations, messages, automation), integrations and OAuth sessions, billing (plans, wallets, transactions, subscriptions, payment orders, invoices), knowledge-base files, notifications and the audit log.

```bash
npm run db:migrate          # create + apply a migration (development)
npm run db:migrate:prod     # apply pending migrations only (deploy)
npm run db:generate         # regenerate the Prisma client
npm run db:push             # push schema without a migration
npm run db:studio           # browse data in Prisma Studio
npm run db:seed             # demo workspace, user and template
npm run db:reset            # ⚠️ drops everything and re-seeds
```

On boot the server checks connectivity *and* that key tables exist, printing a loud, specific error if the schema was never migrated — an unmigrated database is the number-one cause of "every endpoint returns 500" on a fresh setup.

---

## Tests

Node's built-in test runner, no framework:

```bash
cd backend
npm test              # all service tests
npm run test:voice    # voice pipeline — TTS streaming, sentence buffer, disfluency
npm run test:stt      # speech-to-text
npm run test:billing  # money, Razorpay, wallet/subscription/settlement integration
```

Billing integration tests hit a real database, so they load `.env` — point `DATABASE_URL` at a scratch database before running them.

---

## API surface

Everything is under `/api/v1`. `/health` sits outside the prefix.

### Public

| Route | Purpose |
|---|---|
| `POST /auth/register`, `/verify-otp`, `/login`, `/refresh`, `/logout` | Authentication |
| `GET /auth/google`, `/auth/google/callback` | Google OAuth |
| `POST /auth/forgot-password`, `/reset-password` | Password recovery |
| `GET /config`, `/config/plans` | Non-secret public config |
| `POST /assistant/chat` | Marketing-site AI helper (rate-limited, 8/min/IP) |
| `POST /contact-form`, `/appointments`, `/report-issue` | Public forms (10/min/IP) |
| `POST /billing/razorpay/webhook` | HMAC-authenticated, fails closed without the secret |
| `GET \| POST /meta` | Meta WhatsApp webhook — challenge + HMAC-verified events |

### Workspace-scoped

All authenticated and mounted under `/workspaces/:workspaceId`, behind `authenticate` → `workspaceContext`:

```
/agents        /voices        /files         /contacts      /campaigns
/conversations /templates     /whatsapp      /automation    /analytics
/integrations  /notifications /api-keys      /settings      /meta/oauth
/llm  /gemini  /openai  /azure
/wallet  /wallet/topup  /invoices  /subscription  /subscription/autorenew
/caller-numbers
```

Routes that spend money or mutate data are deliberately mounted **only** here — never on the public router.

### Admin

`/admin/*` — authenticated and gated by `isAdmin` on the server, independently of the client-side route guard.

### Diagnostics

`/gemini/health`, `/gemini/metrics`, and the same pair for `/openai` and `/azure`.

---

## Billing model

- **Wallet** denominated in the minor units of `BILLING_CURRENCY` (paise for INR). Every ledger row records the FX rate used, so historical charges stay reproducible when `FX_USD_TO_INR` changes.
- **Plans** carry both USD and INR prices, `includedMinutes`, `kbStorageMb`, and machine-enforceable `maxAgents` / `maxConcurrentCalls` limits that `assertCanStartCall()` actually checks.
- **Top-ups** create a Razorpay order; the wallet is credited by the signed webhook, not by the browser callback.
- **Subscriptions** support wallet-funded purchase, card checkout, and auto-renewal on a saved card. A plan activates on `subscription.charged`, never on the browser's authorization redirect.
- **Renewal sweep** runs hourly in-process and is idempotent per period — the ledger key includes the period boundary, so overlapping ticks or a restart mid-run cannot double-charge.
- **Settlement** rounds call duration to `BILLING_INCREMENT_SEC` (60 by default). A workspace with no resolvable plan is charged `FALLBACK_PER_MINUTE_USD`, deliberately set to the most expensive published rate — failing open on price would hand out unlimited free usage.

`backend/docs/VOICE_AGENT_COST_MODEL.md` documents measured per-minute COGS for every engine combination and derives the rate card from it.

---

## Admin console

Set `SUPER_ADMIN_EMAIL` to the operator's login email. That account is redirected to `/admin` from anywhere in the customer app — a bookmark to `/dashboard`, a stale tab, or the post-login redirect all land in the console, because the operator is not a tenant.

The console has its own shell (`AdminLayout`, not the customer `DashboardLayout`) and covers:

| View | Contents |
|---|---|
| Overview | Platform health and totals |
| Users | Cross-tenant user and workspace management |
| Calls | Cross-tenant call logs with recordings and transcripts |
| Billing / Wallets / Plans | Cross-tenant revenue, balances, plan catalogue |
| Numbers | Phone-number pool |
| Appointments · Issues | Public form submissions |
| Audit | Immutable trail of admin actions |
| Health | Provider and system status |

The client-side guard is UX only — every `/admin` API route enforces `authenticate` + `isAdmin` server-side.

---

## Operational scripts

In `backend/scripts/`:

| Script | Purpose |
|---|---|
| `measure-llm-ttft.js` | Time-to-first-token across LLM providers |
| `measure-turn.js`, `measure-providers.js` | End-to-end turn latency, provider comparison |
| `measure-ambience.js` | Ambient-audio mixing cost |
| `probe-fish.js` | Verify Fish Audio WebSocket model/format support |
| `sync-twilio.js` | Reconcile Twilio numbers |
| `verify-superadmin-role.js`, `verify-admin-phase1.js` | Admin setup checks |
| `clean-test-data.js` | `npm run db:clean-test-data` |
| `prisma-migrate-deploy.js` | Migration deploy used by the pre-dev/pre-start hooks |

Python scripts in the same folder handle the voice-cloning dataset pipeline (VCTK preprocessing, speaker selection, clip extraction).

---

## Further documentation

| Document | Contents |
|---|---|
| `backend/docs/VOICE_AGENT_COST_MODEL.md` | Per-minute COGS by engine, margin analysis, verification log |
| `backend/docs/VOICE_AGENT_PRICE_PER_MINUTE.md` | Customer-facing rate card |
| `backend/docs/AIRTEL_VERIFIED_CALLING_GUIDE.md` | Served at `/api/v1/config/airtel-verified-calling-guide` |
| `backend/LLM_MODULE_README.md`, `LLM_API_DOCUMENTATION.md`, `LLM_QUICKSTART.md` | LLM module reference |
| `backend/FILE_MANAGEMENT_README.md` | Knowledge-base file handling |
| `backend/INTEGRATIONS_API.md` | Integration endpoints |
| `AUDIT_REPORT.md`, `COMPLETION_REPORT.md`, `BUG_SHEET.md` | Codebase audit and tracked defects |
| `TROUBLESHOOTING.md` | Common setup problems |
| `OLLAMA_SETUP.md` | Local model setup |

---

## Troubleshooting

**Every endpoint returns 500.** The schema isn't migrated. Run `npm run db:migrate:prod` in `backend/`. The server prints an explicit banner at boot when key tables are missing.

**`FATAL: DATABASE_URL is not a Postgres connection string`.** You're on the `.env.example` default (`file:./dev.db`) or have a duplicate `DATABASE_URL` line. Keep exactly one `postgresql://` value.

**`Missing required env var: JWT_ACCESS_SECRET`.** `.env` doesn't exist or is missing the JWT secrets — `npm run dev` reads it via `--env-file`, so shell exports alone won't do.

**Web call connects but no audio.** Check that the agent's voice provider key is set and that its provider supports the selected path. `/api/v1/gemini/health` and the equivalent provider health routes report configuration state.

**Phone call plays a greeting and hangs up.** The agent uses a modular pipeline. Switch it to a bundled engine (xAI or ElevenLabs ConvAI) for two-way phone conversations, and set `PUBLIC_BACKEND_WS_URL` to a publicly reachable `wss://` origin.

**Campaign shows no progress.** Redis is unreachable and the in-process dispatcher didn't start, or the plan's concurrency ceiling is full. Both are logged. Progress lives in `CampaignRecipient` rows, so restarting resumes rather than re-dialling.

**CORS errors.** Add the origin to `CLIENT_URL` (comma-separated list accepted). `localhost:5173` and `:5174` are allowed automatically outside production.

More in `TROUBLESHOOTING.md`.
