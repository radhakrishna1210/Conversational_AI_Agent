import { Link } from 'react-router-dom';

export default function DevBackend() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>3. Backend Implementation</h1>

      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        A complete implementation specification of Spandan's Node.js Express API server, business logic services, database interactions, BullMQ queues, worker threads, and WebSocket media bridges.
      </p>

      {/* ── 3.1 BACKEND RUNTIME ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.1 Backend Runtime</h2>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Runtime Configuration</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Node.js Version:</strong> Declared as <code>"engines": &#123; "node": "&gt;=20.0.0" &#125;</code> in `backend/package.json`. Native features like Node Worker Threads and `--env-file` native flag are leveraged.</li>
        <li style={{ marginBottom: 6 }}><strong>ESM Package Configuration:</strong> Configured with <code>"type": "module"</code> in `backend/package.json`. All backend source imports use explicit `.js` extension syntax.</li>
        <li style={{ marginBottom: 6 }}><strong>Environment Loading:</strong> Loaded natively at process launch via <code>node --env-file=.env src/server.js</code>. No `dotenv` npm package dependency is required.</li>
      </ul>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Startup Lifecycle Sequence</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When executing `npm run dev`, the application initializes services in the following execution sequence:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  actor Dev as Developer / CLI
  participant DevScript as npm run dev
  participant NodeProcess as Node ESM (src/server.js)
  participant EnvConfig as env.js Sanity Check
  participant DB as PostgreSQL DB
  participant Redis as Redis Server
  participant Worker as campaign.worker.js
  participant Express as Express App (src/app.js)
  participant WSS as WebSocket Server

  Dev->>DevScript: npm run dev
  DevScript->>NodeProcess: node --env-file=.env src/server.js
  NodeProcess->>EnvConfig: Import src/config/env.js (Validates DATABASE_URL)
  NodeProcess->>DB: Check Agent table presence (SELECT 1 FROM "Agent")
  DB-->>NodeProcess: Schema Verified
  NodeProcess->>Redis: Connect ioredis singleton (src/config/redis.js)
  NodeProcess->>Worker: Instantiate createCampaignWorker()
  NodeProcess->>NodeProcess: Start background schedulers (retention, sweeps)
  NodeProcess->>Express: Initialize middleware stack & mount /api/v1
  NodeProcess->>WSS: Attach 4 WebSocket upgrade matchers (/xai-call, /web-call, /twilio-media, /plivo-media)
  NodeProcess->>Dev: Server listening on http://localhost:4000`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Runtime Failure Behaviour</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Invalid `DATABASE_URL`:</strong> `src/config/env.js` validates `DATABASE_URL` format using regex `^postgres(ql)?://`. If invalid, process throws `FATAL: DATABASE_URL is not a Postgres connection string` and halts startup.</li>
        <li style={{ marginBottom: 6 }}><strong>PostgreSQL Database Unavailable:</strong> Database table check (`server.js:35`) catches connection errors and logs `DATABASE SCHEMA IS NOT MIGRATED: &lt;err&gt;` via Pino logger without crashing the Node process.</li>
        <li style={{ marginBottom: 6 }}><strong>Missing Mandatory Environment Variables:</strong> `src/config/env.js` checks `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` via `required()`. Missing keys throw `Missing required env var: &lt;KEY&gt;` instantly at import time.</li>
        <li style={{ marginBottom: 6 }}><strong>Port Unavailable (EADDRINUSE):</strong> `server.on('error')` catches EADDRINUSE on port 4000, logs fatal error via Pino, and calls `process.exit(1)`.</li>
      </ul>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Verified Backend Package Commands</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Command</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Location</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>What It Does</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Dependencies</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Expected Result</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>npm run predev</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/package.json`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Generates Prisma Client &amp; runs migration deploy script.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Prisma, PostgreSQL</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PostgreSQL schema tables updated and ORM types generated.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>npm run dev</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/package.json`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Starts the main backend Node process with native `.env` loading.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Node.js v20+</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Server listening on `http://localhost:4000`.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>npm run test:voice</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/package.json`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Executes audio pacer &amp; speech gate unit test runner.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Node `--test` runner</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>All voice unit tests pass with zero assertion failures.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>npm run db:migrate</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/package.json`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Generates local dev Prisma migrations.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Prisma CLI</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>New migration file created in `prisma/migrations/`.</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.2 DIRECTORY STRUCTURE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.2 Backend Directory Structure</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan's backend enforces a multi-layer separation model across 11 core directories:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  subgraph BACKEND_APP ["Backend Application Topology"]
    Config[config/ Singleton Init]
    Middleware[middleware/ Auth & Context]
    Routes[routes/ REST Endpoints]
    Controllers[controllers/ Body Parsers]
    Validators[validators/ Zod Schemas]
    Services[services/ Business Logic]
    Queues[queues/ BullMQ Producers]
    Workers[workers/ Async Consumers]
    WS[ws/ Media Bridge]
    DB[(PostgreSQL Database)]
  end

  Config --> Services
  Middleware --> Routes
  Routes --> Controllers
  Controllers --> Validators
  Controllers --> Services
  Controllers --> Queues
  Queues --> Workers
  Workers --> Services
  Services --> DB
  WS --> Services`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram maps the internal component topology of the backend application. It shows how configuration singletons, authentication middleware, Express routes, controllers, Zod validators, domain services, BullMQ queues, worker threads, and WebSocket media bridges interact within the application workspace.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Directory</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility &amp; Architectural Role</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>What Belongs</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>What Should NOT Go Here</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Caller &amp; Called Interactions</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Important File Example</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>config/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Singleton DB client initializers &amp; environment validation.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sanity checks, CSP rules, Prisma/Redis exports.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API route definitions or business logic.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Called by `app.js`, `server.js`, and Services.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/config/env.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>controllers/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HTTP request body parsing and JSON response dispatching.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Reading params/query/body, calling services, returning status codes.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Raw SQL queries or direct third-party SDK calls.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Called by Routes; Calls Services and Validators.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/controllers/campaign.controller.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>middleware/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Request guards, authentication, and tenant isolation.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>JWT token checks, workspace membership verification, error handling.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Feature business logic.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Called by Express Router before Controllers.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/middleware/workspaceContext.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>queues/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>BullMQ queue instance creators.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Queue names constants and `enqueueJob()` helper exports.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Job processing execution logic.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Called by Controllers; Interacts with Redis.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/queues/campaign.queue.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>services/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Domain business logic &amp; provider abstractions.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database mutations, wallet ledgers, LLM/TTS factories, campaign runners.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HTTP req/res objects.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Called by Controllers &amp; Workers; Calls Prisma &amp; External APIs.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/services/billing/billing.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>workers/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Asynchronous BullMQ consumers &amp; worker thread jobs.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Outbound campaign consumers and CPU text extraction threads.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Synchronous HTTP route handlers.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Triggered by Redis / Worker Threads; Calls Services.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/workers/campaign.worker.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>ws/</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Real-time WebSocket connection bridges.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PSTN carrier audio streams, pacers, call finalization.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>REST HTTP endpoint logic.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Triggered by `server.js` upgrade event; Calls Voice Services.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/ws/modularMediaBridge.js`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.3 EXPRESS APPLICATION ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.3 Express Application Stack</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Express application configured in [`backend/src/app.js`](file:///backend/src/app.js) initializes middleware in this exact order:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  Req[Incoming Request] --> M1[1. cors origin callback]
  M1 --> M2[2. helmet CSP directives]
  M2 --> M3[3. express.raw /webhook/meta]
  M3 --> M4[4. express.raw /integrations/webhooks]
  M4 --> M5[5. express.raw /billing/razorpay/webhook]
  M5 --> M6[6. express.json limit: env.JSON_BODY_LIMIT]
  M6 --> M7[7. express.urlencoded extended: false]
  M7 --> M8[8. Debug Logger req.method & req.url]
  M8 --> M9[9. GET /health endpoint]
  M9 --> M10[10. API Routes /api/v1]
  M10 --> M11[11. express.static client/dist]
  M11 --> M12[12. History Fallback index.html]
  M12 --> M13[13. 404 Handler]
  M13 --> M14[14. Global errorHandler.js]` }
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Raw Body Webhook Parsing Rationale</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Webhooks from Meta, third-party integrations, and Razorpay (`/api/v1/billing/razorpay/webhook`) are mounted with <code>express.raw(&#123; type: 'application/json' &#125;)</code> BEFORE `express.json()`. HMAC signatures (such as Razorpay's `X-Razorpay-Signature`) are calculated over the exact raw byte payload transmitted by the payment gateway. Re-serializing parsed JSON via `JSON.stringify()` does not preserve byte-for-byte formatting (whitespace, key ordering), which causes intermittent signature validation failures.
      </p>

      {/* ── 3.4 SERVER ENTRYPOINT ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.4 Server Entrypoint Initialization &amp; Shutdown</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Conceptual breakdown of the initialization order inside [`backend/src/server.js`](file:///backend/src/server.js):
      </p>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>PostgreSQL Connection Test:</strong> Queries `prisma.agent.findFirst()` (`server.js:35`). Logs error if database is unavailable.</li>
        <li style={{ marginBottom: 8 }}><strong>BullMQ Campaign Worker:</strong> Instantiates `createCampaignWorker()` (`server.js:46`) to start listening for queued outbound dial jobs.</li>
        <li style={{ marginBottom: 8 }}><strong>Scheduler Services:</strong> Launches startup hooks for `integrationScheduler`, `voiceSyncScheduler`, `recordingRetention`, `resumeStuckKbJobs`, `renewDueSubscriptions`, and `sweepDueBroadcasts`.</li>
        <li style={{ marginBottom: 8 }}><strong>HTTP Server Creation:</strong> Wraps Express `app` with `http.createServer(app)` (`server.js:93`) to allow shared port WebSocket upgrades.</li>
        <li style={{ marginBottom: 8 }}><strong>WebSocket Upgrade Handlers:</strong> Attaches 4 WebSocket upgrade matchers (`webCallWss`, `modularWebCallWss`, `twilioMediaWss`, `plivoMediaWss`) via `httpServer.on('upgrade')`.</li>
        <li style={{ marginBottom: 8 }}><strong>HTTP Listener:</strong> Binds server to `env.PORT` (4000).</li>
      </ol>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Verified Graceful Shutdown Behavior</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        [`server.js:265`](file:///backend/src/server.js#L265) implements a process shutdown handler listening to `SIGTERM` and `SIGINT` signals:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`const shutdown = async (signal) => {
  logger.info(\`\${signal} received — shutting down\`);
  server.close(async () => {
    if (integrationScheduler?.stop) integrationScheduler.stop();
    if (voiceSyncScheduler?.stop) voiceSyncScheduler.stop();
    if (recordingRetention?.stop) recordingRetention.stop();
    clearInterval(renewalTimer);
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_PERIOD_MS); // Force exit after 10s
};`}
        </code>
      </pre>

      {/* ── 3.5 API ROUTING ARCHITECTURE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.5 API Routing Architecture &amp; Endpoint Reference</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        API routes are mounted under `/api/v1/` in [`backend/src/routes/index.js`](file:///backend/src/routes/index.js):
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Authentication &amp; System Domain Routes</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Method</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Full Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Route File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Middleware</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Controller Handler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Validator</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Tenant Scoped</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/auth/register`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`auth.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`sendLimiter` (5/min)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`requestSignupOtp`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`registerSchema`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sends signup OTP email</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/auth/login`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`auth.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`login`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`loginSchema`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Validates password &amp; issues JWTs</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/auth/refresh`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`auth.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`refresh`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`refreshSchema`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Rotates refresh token &amp; returns access token</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>GET</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/auth/me`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`auth.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`me`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Returns active user record</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Workspace-Scoped Domain Routes</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Method</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Full Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Route File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Middleware</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Controller Handler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Validator</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Tenant Scoped</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/workspaces/:wsId/campaigns`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaign.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate`, `workspaceContext`, `authorize('Member')`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`createCampaign`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`createCampaignSchema`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Creates outbound calling campaign</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/workspaces/:wsId/campaigns/:cId/launch`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaign.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate`, `workspaceContext`, `authorize('Member')`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`launchCampaign`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`scheduleCampaignSchema`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Launches campaign to BullMQ queue</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/workspaces/:wsId/agents`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`agent.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate`, `workspaceContext`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`createAgent`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Creates voice agent prompt &amp; settings</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>POST</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/api/v1/workspaces/:wsId/files`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`kbFile.routes.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate`, `workspaceContext`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`upload`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Uploads PDF document for text parsing</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Real Endpoint Execution Trace Example</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Tracing <code>POST /api/v1/workspaces/:workspaceId/campaigns/:campaignId/launch</code>:
      </p>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>Route Dispatcher:</strong> Request enters [`backend/src/routes/campaign.routes.js:27`](file:///backend/src/routes/campaign.routes.js#L27).</li>
        <li style={{ marginBottom: 8 }}><strong>Authentication &amp; Workspace Context:</strong> `authenticate` checks JWT Bearer token; `workspaceContext` verifies `req.user.userId` has a valid `WorkspaceMember` row.</li>
        <li style={{ marginBottom: 8 }}><strong>Payload Validation:</strong> `validate(scheduleCampaignSchema)` checks body params via Zod schema.</li>
        <li style={{ marginBottom: 8 }}><strong>Controller Execution:</strong> Invokes `ctrl.launchCampaign` in [`backend/src/controllers/campaign.controller.js`](file:///backend/src/controllers/campaign.controller.js).</li>
        <li style={{ marginBottom: 8 }}><strong>Service &amp; Queue Trigger:</strong> Controller calls <code>enqueueCampaign(&#123; campaignId, workspaceId &#125;)</code> in [`backend/src/queues/campaign.queue.js`](file:///backend/src/queues/campaign.queue.js), pushing job `'dispatch'` to Redis.</li>
        <li style={{ marginBottom: 8 }}><strong>Response:</strong> Returns `200 OK` JSON response: <code>&#123; success: true, status: "SCHEDULED" &#125;</code>.</li>
      </ol>

      {/* ── 3.6 MIDDLEWARE ARCHITECTURE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.6 Middleware Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan's pipeline uses Express middlewares for security headers, payload validation, and context setup:
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Middleware Pipeline Inventory</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>File Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Creates/Modifies Properties</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Conditions &amp; Responses</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>authenticate</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/middleware/authenticate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sets `req.user`, `req.authType`, `req.workspace` (on API key matching)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Missing Authorization header or signature verification mismatch. Returns `401 Unauthorized` with JSON payload <code>&#123; error: "Invalid or expired token" &#125;</code>.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>workspaceContext</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/middleware/workspaceContext.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sets `req.workspace` and `req.membership`, updates `req.user.role`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`userId` is not a member of `:workspaceId`. Returns `403 Forbidden` with <code>&#123; error: "Not a member of this workspace" &#125;</code>. Returns `503` if DB connection times out.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>authorize</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/middleware/authorize.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bypasses if Superadmin, verifies roles</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Role is not in the allowed list. Returns `403 Forbidden` with <code>&#123; error: "Insufficient permissions" &#125;</code>.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>validate</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`src/middleware/validate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Overwrites `req.body` or target source with parsed, type-cast data</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Safe parsing failure. Passes ZodError directly to `next(error)` which propagates to `errorHandler.js` returning `400 Bad Request`.</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.7 AUTHENTICATION MIDDLEWARE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.7 Authentication Middleware &amp; Token Lifecycle</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The JWT-based authentication flow handles secure login, credentials validation, token validation, and refresh token rotation:
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Credential Validation &amp; Token Storage</h3>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>API Credentials Check:</strong> `POST /api/v1/auth/login` validates credentials in `auth.controller.js`. It fetches User and compares passwords using Bcrypt.</li>
        <li style={{ marginBottom: 6 }}><strong>Access Token Placement:</strong> Generates 15-minute token containing <code>&#123; userId, email, role, workspaceMemberships &#125;</code> signed with `JWT_ACCESS_SECRET`.</li>
        <li style={{ marginBottom: 6 }}><strong>Refresh Token Storage:</strong> Generates 7-day token signed with `JWT_REFRESH_SECRET`, hashes it with SHA-256 via `hashToken()`, and writes it to the `RefreshToken` table in PostgreSQL.</li>
      </ol>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Authentication Failure Matrix</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Condition</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>HTTP Status</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Returned JSON Payload</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Missing Authorization header / prefix</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>401 Unauthorized</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; "error": "Authentication required" &#125;`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Expired JWT signature / invalid key</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`jwt.js` / `authenticate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>401 Unauthorized</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; "error": "Invalid or expired token" &#125;`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Revoked / deleted workspace API key</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`authenticate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>401 Unauthorized</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; "error": "Invalid or revoked API key" &#125;`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.8 WORKSPACE CONTEXT & AUTHORIZATION ─────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.8 Workspace Context &amp; Authorization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Multi-tenant isolation ensures workspace resources remain private. The resolution sequence is as follows:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  Request[Request workspaceId param] --> Token{Evaluate req.user}
  Token -->|User ID / JWT| MemberDb[Query WorkspaceMember matching userId_workspaceId]
  MemberDb -->|Found| Inject[Attach req.workspace, req.membership, req.user.role]
  MemberDb -->|Not Found| Deny[Return HTTP 403 Forbidden]
  Token -->|API Key sk_live| KeyDb[Attach req.workspace & bypass member checks]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Common Workspace Security Failure Modes</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Unscoped Prisma Mutations:</strong> Attempting to update database records (e.g. `prisma.campaign.update`) using only `where: &#123; id: campaignId &#125;` bypassing the tenant boundaries. Correct scoped mutations must execute with <code>where: &#123; id: campaignId, workspaceId &#125;</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Database Timeout Leaks:</strong> DB locks or connection drops during workspace check: covered by fallback logic in `workspaceContext.js` which catches connection failures and fails closed, returning `503 Service Unavailable`.</li>
      </ul>

      {/* ── 3.9 VALIDATION LAYER ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.9 Validation Layer</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan wraps Zod validation schemas using the `validate(schema, source)` middleware factory. Type conversions and parsing constraints are validated before hitting the controllers.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Core Validator Schema Rules</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Domain / File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Schema Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Target Router</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Important Fields &amp; Type Constraints</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaign.validator.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>createCampaignSchema</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`POST /workspaces/:wsId/campaigns`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`name` (string min 1), `agentId` (uuid string), `clusterId` (uuid string)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaign.validator.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>scheduleCampaignSchema</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`POST /workspaces/:wsId/campaigns/:cId/launch`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`scheduledAt` (ISO date-time string, must be set in the future)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`auth.validator.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}><code>loginSchema</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`POST /auth/login`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`email` (string, valid email format), `password` (string min 6)</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.10 CONTROLLER LAYER ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.10 Controller Layer</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Controllers handle parameter mapping, validation, service invocation, and return JSON payloads. They do NOT execute business logic or direct ORM operations.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Real Endpoint Execution Trace: Simple CRUD vs Campaign Launch</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Phase</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>CRUD trace: `GET /agents/:agentId`</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Workflow trace: `POST /campaigns/:id/launch`</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>1. Route Mount</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`agent.routes.js:10`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaign.routes.js:27`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>2. Middlewares</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`authenticate` &amp; `workspaceContext`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`authenticate`, `workspaceContext`, `authorize('Member')`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>3. Controller</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`agent.controller.js` &rarr; `getAgent`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaign.controller.js` &rarr; `launchCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>4. Service Layer</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Queries `prisma.agent.findFirst` directly using scoping parameters.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Invokes `enqueueCampaign()` from `campaign.queue.js`.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>5. Response shape</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>JSON agent details object</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; success: true, status: "SCHEDULED" &#125;`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.11 SERVICE LAYER ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.11 Service Layer &amp; Domain Workflows</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Services implement business logic and coordinate domain operations:
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Service Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>File Location</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Persistent Data Models</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>External API Dependencies</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`billingService`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`services/billing/billing.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Wallet top-ups, call deductions, ledgers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`Wallet`, `WalletTransaction`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Razorpay SDK</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`llmFactory`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`services/llm.factory.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>LLM provider instantiation &amp; automatic fallback</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`Agent`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Gemini API / OpenAI SDK</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`telephonyFactory`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`services/telephony/index.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Route matching to carrier providers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`CallLog`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>Twilio API / Plivo SDK</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.12 DATABASE ACCESS LAYER ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.12 Database Access Layer</h2>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Supabase PgBouncer Configuration</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        In database connection pooling, connections for queries are routed through port `6543` (PgBouncer in transaction mode). Direct migrations bypass PgBouncer and connect directly to port `5432` using the migration deployment script [`backend/scripts/prisma-migrate-deploy.js`](file:///backend/scripts/prisma-migrate-deploy.js) under configuration <code>PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1</code>.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Transaction Atomicity Examples</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Prisma `$transaction` blocks are utilized inside the Razorpay payment webhook handler to guarantee that updating an order's status to `PAID` and crediting the user's `Wallet` balance occurs atomically. If the wallet credit fail-closes due to a constraint, the order update rolls back completely.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Prisma Entity Relationship Diagram (ERD)</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`erDiagram
  User ||--o{ WorkspaceMember : belongs_to
  Workspace ||--o{ WorkspaceMember : contains
  Workspace ||--o{ Agent : owns
  Workspace ||--o{ Campaign : runs
  Workspace ||--o{ Wallet : has
  Campaign ||--o{ CallLog : generates
  Wallet ||--o{ WalletTransaction : records`}
        </pre>
      </div>

      {/* ── 3.13 PRISMA & DATABASE MODELS ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.13 Prisma &amp; Database Models</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Prisma is initialized as a singleton client inside [`backend/src/config/prisma.js`](file:///backend/src/config/prisma.js). The client handles database connection pooling, using variables loaded from the environment:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>DATABASE_URL:</strong> Supplied to Prisma Client for general workspace queries. Configured to route through port <code>6543</code> (PgBouncer transaction-mode pooler on Supabase).</li>
        <li style={{ marginBottom: 6 }}><strong>DIRECT_URL:</strong> Connects to PostgreSQL directly on port <code>5432</code>. Used exclusively during database schema migration deployments (`scripts/prisma-migrate-deploy.js`) where advisory locks are required.</li>
        <li style={{ marginBottom: 6 }}><strong>ORM Lifecycle:</strong> Binds database connection check to boot. Calls `prisma.$disconnect()` gracefully during shutdown process listeners trap (`server.js:272`).</li>
      </ul>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Core Domain Model Map</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Model Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Primary Key</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Tenant Scoped</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Unique Constraints / Indexes</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsible Services</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Workspace</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Self (Tenant Root)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`slug` (Unique)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`workspaceContext`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>WorkspaceMember</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (`workspaceId`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`userId_workspaceId` (Unique)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`workspaceContext`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Agent</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (`workspaceId`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`workspaceId_id` index</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`agentRuntime.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Campaign</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (`workspaceId`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`status` index</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Wallet</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (`workspaceId`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`workspaceId` (Unique)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`billing.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>WalletTransaction</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No (Wallet parent linked)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`idempotencyKey` (Unique)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`billing.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>KbFile</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`id` (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes (`workspaceId`)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`workspaceId` index</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`kbChunking.service.js`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Database Transaction Boundaries ($transaction)</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan enforces atomicity on sensitive ledger updates. For example, in [`backend/src/services/billing/billing.service.js`](file:///backend/src/services/billing/billing.service.js), wallet balance modifications execute inside a serializable transaction block:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`await prisma.$transaction(async (tx) => {
  const wallet = await tx.wallet.findUnique({ where: { workspaceId } });
  const newBalance = wallet.balanceCents + amountCents;
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balanceCents: newBalance }
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amountCents,
      balanceAfterCents: newBalance,
      type,
      idempotencyKey
    }
  });
});`}
        </code>
      </pre>

      {/* ── 3.14 REDIS ARCHITECTURE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.14 Redis Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Redis is used primarily as a **Queue Backend** backing the BullMQ Campaign Dial pipeline. No cache, pub/sub, or transient session states are persisted in Redis.
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph LR
  NodeServer[Node Server Entrypoint] -->|New Redis Instance| AppClient[redis Client]
  NodeServer -->|New Redis Instance maxRetriesPerRequest: null| BullConnection[bullConnection Client]
  BullConnection -->|Binds to| BullMQQueue[BullMQ 'campaign-dispatch' Queue]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Redis Runtime Failure &amp; Disconnect Behaviour</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        [`backend/src/config/redis.js`](file:///backend/src/config/redis.js) captures connection failures cleanly:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Startup Unavailable:</strong> If connection fails 3 times, `retryStrategy` returns `null` to prevent blocking the event loop and drops to memory mode (`redis = null`).</li>
        <li style={{ marginBottom: 6 }}><strong>Upstash Quota Limits Exceeded:</strong> Error event matches `'max requests limit exceeded'`. The process automatically calls `redis.disconnect()` and switch to fallback mode to avoid loop hangs.</li>
      </ul>

      {/* ── 3.15 BULLMQ QUEUE ARCHITECTURE ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.15 BullMQ Queue Architecture</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.1 Purpose</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        BullMQ is integrated into Spandan to manage asynchronous execution of outbound telephony campaigns. By offloading telephony dial requests to background workers, Spandan avoids blocking the Express HTTP server's event loop when initiating hundreds of concurrent outgoing phone calls. No other workloads currently use BullMQ.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.2 Queue Architecture</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system routes campaign launch triggers down to carrier dialers in the following flow:
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  ReactFront[React Frontend App] -->|1. Click Launch REST POST| ExpressAPI[Express Server /api/v1]
  ExpressAPI -->|2. Invoke enqueueCampaign| QueueProducer[campaign.queue.js]
  QueueProducer -->|3. Add Job 'dispatch'| Redis[(Redis Server)]
  Worker[campaign.worker.js] -->|4. Poll Redis for Job| Redis
  Worker -->|5. Execute runCampaign| CampaignService[campaignRunner.service.js]
  CampaignService -->|6. Dial PSTN number| Carrier[Telephony Provider Twilio/Plivo]
  CampaignService -->|7. Scopes queries| PostgreSQL[(PostgreSQL DB)]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.3 Redis and BullMQ Relationship</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        BullMQ leverages Redis as its storage backing layer. Connection details:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Bull Connection Singleton:</strong> Managed via <code>bullConnection</code> exported from `backend/src/config/redis.js`. It instantiates a separate Redis client using <code>maxRetriesPerRequest: null</code> (mandatory for BullMQ queues/workers).</li>
        <li style={{ marginBottom: 6 }}><strong>Redis Usage Scope:</strong> Redis is only used to store BullMQ jobs and state metadata. It is NOT utilized as a general caching or session layer.</li>
        <li style={{ marginBottom: 6 }}><strong>Redis Loss/Failure:</strong> If Redis becomes unavailable, BullMQ operations fail-closed. Attempting to queue a campaign throws an error caught by Express, preventing the launch, while active workers disconnect and retry.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.4 Queue Inventory</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Queue</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Queue File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Producer</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Consumer</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Worker File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Job Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Payload</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Retry</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Backoff</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concurrency</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>'campaign-dispatch'</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`enqueueCampaign()`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`processCampaign()`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>'dispatch'</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Launches campaign voice call dials</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>&#123; campaignId, workspaceId &#125;</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>3 (JOB_MAX_ATTEMPTS)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>5000ms exponential</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>env.CAMPAIGN_WORKER_CONCURRENCY</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.5 Queue Creation</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The campaign queue instantiation is handled in `backend/src/queues/campaign.queue.js`:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`export const campaignQueue = bullConnection
  ? new Queue('campaign-dispatch', bullConnection)
  : null;`}
        </code>
      </pre>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.6 Job Production</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        A job is produced when an authenticated workspace user launches a campaign:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  actor User as Browser / API client
  participant Router as campaign.routes.js
  participant Controller as campaign.controller.js
  participant Queue as campaign.queue.js
  participant Redis as Redis Storage

  User->>Router: POST /workspaces/:wsId/campaigns/:cId/launch
  Router->>Controller: launchCampaign(req, res)
  Controller->>Queue: enqueueCampaign(campaignId, workspaceId)
  Queue->>Redis: campaignQueue.add('dispatch', payload, options)
  Redis-->>Queue: Job enqueued successfully
  Queue-->>Controller: Return Job ID
  Controller-->>User: HTTP 200 { success: true, status: 'SCHEDULED' }`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.7 Job Payload Contract</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Jobs enqueued into `campaign-dispatch` must match the following JSON schema:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`{
  "campaignId": "cuid_of_campaign",
  "workspaceId": "cuid_of_workspace"
}`}
        </code>
      </pre>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>campaignId (String, Required):</strong> UUID/CUID identifying the target campaign configuration in PostgreSQL. Used by workers to query recipient phone numbers.</li>
        <li style={{ marginBottom: 6 }}><strong>workspaceId (String, Required):</strong> Identifies the workspace hosting the campaign. Enforces tenant scope when querying database records.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.8 Worker Initialization</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Workers start at server boot inside `backend/src/server.js` by invoking `createCampaignWorker()`. The worker binds `processCampaign` to `'campaign-dispatch'` using the connection options and concurrency config from the environment:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`export const createCampaignWorker = () => {
  if (!bullConnection) return null;
  return new Worker('campaign-dispatch', processCampaign, {
    ...bullConnection,
    concurrency: env.CAMPAIGN_WORKER_CONCURRENCY,
  });
};`}
        </code>
      </pre>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.9 Worker Execution Lifecycle</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`stateDiagram-v2
  [*] --> WAITING: Job enqueued (enqueueCampaign)
  WAITING --> ACTIVE: Worker polls job
  ACTIVE --> PROCESSING: processCampaign starts running
  PROCESSING --> COMPLETED: runCampaign completes successfully
  PROCESSING --> FAILED: runCampaign throws an error
  FAILED --> WAITING: Attempts < 3 (exponential backoff retry)
  FAILED --> FAILED_END: Attempts exhausted (fails job)`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.10 Campaign Job Execution</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When `processCampaign` picks up a job, it calls `runCampaign(campaignId, workspaceId)` from `backend/src/services/campaignRunner.service.js`. This function scopes campaign, recipient, and wallet lookups to the database. If balance verification passes, the runner initiates REST outbound dialing commands to Twilio or Plivo APIs and updates recipient states to `calling`.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.11 Retry and Backoff</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Retry configuration is defined in limits and queue:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Attempts Limit:</strong> Set to <code>JOB_MAX_ATTEMPTS</code> (3 attempts).</li>
        <li style={{ marginBottom: 6 }}><strong>Backoff Policy:</strong> Configured as <code>backoff: &#123; type: 'exponential', delay: 5000 &#125;</code> (5000ms delay doubled on each subsequent failure).</li>
        <li style={{ marginBottom: 6 }}><strong>Retry triggers:</strong> Any unhandled exception thrown in the worker's processing block (e.g. database disconnect, API gateway timeout) triggers retry.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.12 Concurrency</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Concurrency is governed by <code>env.CAMPAIGN_WORKER_CONCURRENCY</code> (configured in `backend/src/config/env.js`). Concurrency defines the maximum number of campaign dispatch jobs processed simultaneously by a single worker instance.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.13 Job State and Failure Handling</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If a job fails entirely (exhausting all 3 attempts), the worker catches the failure, logs it via Pino logger, and marks the parent Campaign status as `FAILED` in the PostgreSQL database, saving the last message to the `lastError` column.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.14 Idempotency and Duplicate Execution</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan does NOT use BullMQ's native deduplication/jobId keys. Instead, idempotency is enforced inside `campaignRunner.service.js` which verifies if a `CampaignRecipient` status has already changed from `pending` before attempting to dial the telephony APIs.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.15 Redis Failure Behaviour</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Verified Behaviour:</strong> If Redis goes down during startup, BullMQ queues/workers are set to `null` and fallback modes are enabled. Attempts to launch campaigns throw exceptions.</li>
        <li style={{ marginBottom: 6 }}><strong>Runtime Disconnection:</strong> BullMQ automatically registers retry listeners. If connection is not recovered within 3 retry strategy ticks, worker processes are paused.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.16 Worker Crash / Restart Behaviour</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If the process crashes or gets redeployed, jobs that were active in BullMQ remain in the `active` list in Redis. Upon server reboot, stuck jobs are returned to the queue or swept cleanly according to BullMQ's default recovery strategy.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.17 Queue Monitoring and Debugging</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Developers can troubleshoot enqueued campaigns using Pino logs (filtering by `campaignId` and `'campaign-dispatch'`) or checking database tables (`Campaign` status and `lastError` fields).
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.18 Operational Failure Matrix</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Symptom</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>First File to Inspect</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Relevant Log</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Resolution</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign stays in `SCHEDULED` status indefinitely</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis connection down or worker process did not start.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/config/redis.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`⚠️ Redis error` or `Redis connection failed`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Verify Redis URL credentials and restart Redis.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign status flips to `FAILED` with provider error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio/Plivo API credentials invalid or out of balance.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/campaignRunner.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`Campaign worker: processing` &rarr; SDK error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Update telephony credentials in settings panel.</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.19 Code References</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Relevant Function / Symbol</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Queue creation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaignQueue`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Job production</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`enqueueCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker creation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`createCampaignWorker`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Job processor</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`processCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis connection</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/config/redis.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`bullConnection`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.15.20 Engineering Notes</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Developers modifying this queue should note that Upstash limits max request quotas, which is captured in the error logic of `redis.js`. If quota limits are reached, the application disconnects cleanly and shifts to an un-enqueued execution path to maintain service availability.
      </p>

      {/* ── 3.16 CAMPAIGN WORKER ──────────────────────────────────────────── */}

      {/* ── 3.16 CAMPAIGN WORKER ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.16 Campaign Worker</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.1 Purpose</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Campaign Worker is a dedicated background task consumer running in its own event context. Its primary purpose is to dial voice call recipients sequentially while managing plan limits, wallet boundaries, and carrier states without introducing latency to Express router handlers.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.2 Campaign Execution Architecture</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  ReactApp[client/src/pages/campaigns/Campaigns.tsx] -->|REST POST launch| Controller[backend/src/controllers/campaign.controller.js]
  Controller -->|campaignService.launchCampaign| Service[backend/src/services/campaign.service.js]
  Service -->|enqueueCampaign| QueueProducer[backend/src/queues/campaign.queue.js]
  QueueProducer -->|Redis client| Redis[(Redis Server)]
  Worker[backend/src/workers/campaign.worker.js] -->|Polls Queue| Redis
  Worker -->|runCampaign| Runner[backend/src/services/campaignRunner.service.js]
  Runner -->|assertCanStartCall| Settlement[backend/src/services/billing/settlement.service.js]
  Runner -->|placeOutboundCall| OutboundService[backend/src/services/outboundCall.service.js]
  OutboundService -->|HTTP POST dial| Telephony[Twilio/Plivo APIs]
  Telephony -->|WSS voice stream| WsBridge[backend/src/ws/modularMediaBridge.js]
  WsBridge -->|reapAbandonedCalls / settleCall| Settlement`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.3 Worker Initialization</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The worker is initialized at boot in <code>backend/src/server.js</code>. The startup execution maps:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`// server.js
import { createCampaignWorker } from './workers/campaign.worker.js';
const worker = createCampaignWorker();`}
        </code>
      </pre>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Worker File:</strong> `backend/src/workers/campaign.worker.js`</li>
        <li style={{ marginBottom: 6 }}><strong>Queue Name:</strong> <code>'campaign-dispatch'</code></li>
        <li style={{ marginBottom: 6 }}><strong>Redis Connection:</strong> Configured via the <code>bullConnection</code> config option object.</li>
        <li style={{ marginBottom: 6 }}><strong>Concurrency:</strong> Reads <code>env.CAMPAIGN_WORKER_CONCURRENCY</code> from environmental configurations.</li>
        <li style={{ marginBottom: 6 }}><strong>Shutdown Traps:</strong> Listens for SIGTERM / SIGINT signals to call <code>worker.close()</code>, wrapping up active loops before process exit.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.4 Job Creation</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Campaign launching executes via HTTP API routing:
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  actor Admin as User Dashboard
  participant Router as campaign.routes.js
  participant Controller as campaign.controller.js
  participant Service as campaign.service.js
  participant Queue as campaign.queue.js

  Admin->>Router: POST /workspaces/:workspaceId/campaigns/:campaignId/launch
  Router->>Controller: launchCampaign(req, res)
  Controller->>Service: launchCampaign(workspaceId, campaignId, scheduledAt)
  Service->>Queue: enqueueCampaign(campaignId, workspaceId, delay)
  Queue-->>Service: BullMQ Job
  Service-->>Controller: Updated Campaign details
  Controller-->>Admin: HTTP 200 { success: true }`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.5 Job Payload</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Field</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Used By</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>campaignId</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>String (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Request params (campaignId)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Identifies campaign table row to process</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>workspaceId</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>String (cuid)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Request params (workspaceId)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensures query limits are scoped to tenant boundaries</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.6 Worker Processor</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Inside <code>campaign.worker.js</code>, the processing function maps as follows:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Job Received:</strong> BullMQ framework extracts job payload parameters.</li>
        <li style={{ marginBottom: 6 }}><strong>Payload Extraction:</strong> Extracts <code>campaignId</code> and <code>workspaceId</code> from <code>job.data</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Runner Delegation:</strong> Resolves and triggers `runCampaign(campaignId, workspaceId)` from `campaignRunner.service.js`.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.7 campaignRunner.service.js</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The file `backend/src/services/campaignRunner.service.js` holds the core execution loop.
      </p>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Responsibilities</h4>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Validating campaign status, rotating through configured caller numbers, batching contacts, calling the telephony adapters, and handling compliance gates.
      </p>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Internal Flow stages:</h4>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 4 }}>Validates active state to protect against double execution using the local <code>active</code> singleton Map.</li>
        <li style={{ marginBottom: 4 }}>Queries details from <code>prisma.campaign</code>.</li>
        <li style={{ marginBottom: 4 }}>Verifies telephony carrier validation properties via <code>telephonyStatusForNumber()</code>.</li>
        <li style={{ marginBottom: 4 }}>Runs Indian Telecom Regulatory (DLT) compliance verification via <code>assertRotationCompliant()</code>.</li>
        <li style={{ marginBottom: 4 }}>Loops through pending contacts extracted in chunks of 50 (<code>BATCH_SIZE</code>).</li>
        <li style={{ marginBottom: 4 }}>Validates pre-call budgets using <code>assertCanStartCall()</code>. If rate limits or billing checks trigger a concurrency limit, it waits (<code>CONCURRENCY_WAIT_MS = 15s</code>) and retries.</li>
        <li style={{ marginBottom: 4 }}>Dispatches out to <code>placeOutboundCall()</code>.</li>
      </ol>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.8 Campaign State Machine</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`stateDiagram-v2
  DRAFT --> SCHEDULED: ScheduledAt provided
  DRAFT --> RUNNING: launchCampaign / startCampaign triggered
  SCHEDULED --> RUNNING: Launch timer expired
  RUNNING --> PAUSED: Inconcurrency timeout or manual Pause request
  RUNNING --> COMPLETED: Loop finishes processing all recipients
  RUNNING --> CANCELLED: cancelCampaign called (retires pending rows)
  RUNNING --> FAILED: Telephony failures or missing bot setup`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.9 Recipient / Contact Processing</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Source:</strong> Extracted in increments of 50 from <code>CampaignRecipient</code> rows.</li>
        <li style={{ marginBottom: 6 }}><strong>Filtering &amp; Opt-Outs:</strong> Inside the batch loop, any contact whose state is modified to non-ACTIVE status in the <code>Contact</code> table is skipped automatically.</li>
        <li style={{ marginBottom: 6 }}><strong>Deduplication:</strong> In-flight edits prevent double-dials. The recipient row's status changes to `calling` before dialing.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.10 Telephony Dispatch</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Telephony routing is handled dynamically in <code>placeOutboundCall()</code> inside `backend/src/services/outboundCall.service.js`. Based on the workspace configurations, dial jobs resolve the correct telephony provider (Twilio or Plivo), using stored API keys to invoke dial commands.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.11 Call Lifecycle</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Outbound dials return a carrier ID (Twilio Call SID or Plivo UUID). Once connected, the carrier triggers a webhook upgrade upgrade pathname that maps to the `/twilio-media` or `/plivo-media` websocket bridges, handing off the live conversational pipeline to the real-time agent engine. The campaign worker does not handle live audio streaming.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.12 Billing Interaction</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Pre-Call Gate:</strong> <code>assertCanStartCall()</code> queries the workspace's wallet balance. If balance is less than required for 10 seconds of talk time (<code>MIN_CALL_SECONDS</code>), calls are refused.</li>
        <li style={{ marginBottom: 6 }}><strong>Deductions:</strong> Executed post-call in <code>settleCall()</code> based on final talk time. Deductions write to the append-only ledger `WalletTransaction` with a unique call ID idempotency key.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.13 Pause / Resume / Cancellation</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Implemented via <code>requestStop(campaignId)</code> inside `campaignRunner.service.js`. Setting <code>stop = true</code> instructs the batch loop to suspend executions safely after the current in-flight call completes. Pause and Cancel actions update the <code>CampaignRecipient</code> rows.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.14 Retry Behaviour</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  WorkerError[campaignRunner exception] -->|Propagated| WorkerBlock[campaign.worker.js]
  WorkerBlock -->|Job Failed| BullMQ[BullMQ retry loop]
  BullMQ -->|Retry attempt < 3| Reschedule[Reschedule with exponential delay]
  BullMQ -->|Attempts exhausted| FinalFail[Fail Job and log status]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.15 Concurrency &amp; Rate Limiting</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The campaign runner loops dial commands spaced by <code>DIAL_SPACING_MS = 1000ms</code> to prevent API carrier throttling. It respects the workspace concurrency caps verified inside the billing gate, halting dials if the concurrency limit is reached.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.16 Duplicate Execution / Idempotency</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        No explicit BullMQ-level idempotency mechanism was identified. However, race protection is enforced inside `campaignRunner.service.js` which registers running campaigns in a local `active` Map. This prevents duplicate triggers from starting a concurrent loop for the same campaign.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.17 Failure Scenarios</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Where Detected</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>What Happens</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Database State</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>BullMQ State</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Missing voice agent</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaignRunner` check</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Aborts execution</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign status FAILED</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Completed</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Add agent configurations</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Insufficient balance</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`assertCanStartCall` check</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Pauses loop</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign status PAUSED</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Completed</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Top-up wallet balance</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis failure</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`startCampaign` call</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Dispatches in-process</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign status RUNNING</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>N/A (Bypassed)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>In-process executor runs campaign</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.18 Logging &amp; Debugging</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The campaign worker registers structured logs under the pino category `'Campaign dispatch started'` and `'Campaign call failed'`. To troubleshoot:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 4 }}>Identify the Campaign UUID from the database.</li>
        <li style={{ marginBottom: 4 }}>Filter worker process stdout for <code>campaignId</code>.</li>
        <li style={{ marginBottom: 4 }}>Verify the state of <code>CampaignRecipient</code> rows matching the campaignId.</li>
      </ol>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.19 Database Impact</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Model/Table</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Read/Write</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Operation</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Campaign</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Read &amp; Write</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Updates state, counters, progress, and error traces</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>CampaignRecipient</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Read &amp; Write</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Updates state to `calling`, `sent`, or `failed`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Contact</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Read &amp; Write</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Updates lastCalledAt timestamps and increments call counts</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`campaignRunner`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.20 Complete Campaign Execution Trace</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  actor User as User Dashboard
  participant Controller as campaign.controller.js
  participant Queue as campaign.queue.js
  participant Worker as campaign.worker.js
  participant Runner as campaignRunner.service.js
  participant Telephony as Twilio/Plivo APIs
  participant Finalizer as callFinalizer.js

  User->>Controller: Click launch (HTTP POST)
  Controller->>Queue: enqueueCampaign()
  Queue->>Worker: Polls job data
  Worker->>Runner: runCampaign()
  Runner->>Telephony: placeOutboundCall()
  Telephony-->>Runner: Return carrier UUID
  Telephony->>User: Dial phone connection
  User-->>Finalizer: Hangup connection
  Finalizer->>Finalizer: settleCall() (deducts balance)`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.21 Developer Modification Guide</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Adding a campaign execution rule:</strong> Modify the batch recipient iteration loops inside `campaignRunner.service.js`.</li>
        <li style={{ marginBottom: 6 }}><strong>Changing outbound dialing configurations:</strong> Edit <code>placeOutboundCall()</code> in `backend/src/services/outboundCall.service.js`.</li>
        <li style={{ marginBottom: 6 }}><strong>Configuring BullMQ processing parameters:</strong> Modify queue initialization options inside `backend/src/queues/campaign.queue.js`.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.16.22 Code Reference Map</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Repository Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Function / Symbol</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/campaign.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`createCampaignWorker`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Queue</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/queues/campaign.queue.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`campaignQueue`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign runner</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/campaignRunner.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`runCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Controller</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/controllers/campaign.controller.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`launchCampaign`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Telephony service</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/outboundCall.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`placeOutboundCall`</td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.17 WORKER THREADS ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.17 Worker Threads</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.1 Purpose</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan uses Node.js Worker Threads to offload synchronous, CPU-heavy Knowledge Base text extraction (specifically PDF parsing). Running these CPU-bound operations in the main event loop would introduce audio jitter and packet loss on concurrent real-time voice call websocket pacers.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.2 Worker Thread Inventory</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Worker Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Parent Module</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Work Performed</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Input</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Output</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>kbExtract</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/kbExtract.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`kbChunking.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Parses plain-text files and PDFs off-loop</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>&#123; filePath, mimeType &#125;</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>&#123; ok: true, text &#125;</code> or <code>&#123; ok: false, error &#125;</code></td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.3 Thread Architecture</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  ParentProcess[Main Event Loop: kbChunking.service.js] -->|1. new Worker path, options| ChildThread[Worker Thread: kbExtract.worker.js]
  ChildThread -->|2. Invoke extractText| ExtractionService[textExtraction.service.js]
  ExtractionService -->|3. Read and parse buffer| DiskFiles[(Stored File on Disk)]
  ChildThread -->|4. parentPort.postMessage| ParentProcess
  ParentProcess -->|5. terminate child| ChildThread`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.4 Parent Thread</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The child thread is spawned dynamically inside `backend/src/services/kbChunking.service.js` using the helper function <code>extractInWorker(filePath, mimeType)</code>.
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Spawn Mechanism:</strong> Spawns a one-shot worker thread per document processing trigger (not pooled) using <code>new Worker(WORKER_PATH, &#123; workerData: &#123; filePath, mimeType &#125; &#125;)</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Listeners:</strong> Binds <code>worker.once('message')</code> to resolve parsed text, <code>worker.once('error')</code> to catch unhandled failures, and <code>worker.once('exit')</code> to reject if the child exits with a non-zero code.</li>
        <li style={{ marginBottom: 6 }}><strong>Termination:</strong> Closes the thread instantly using <code>worker.terminate()</code> once message or error hooks settle.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.5 Worker Thread Entry Point</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The worker entrypoint `backend/src/workers/kbExtract.worker.js` immediately extracts input parameters and triggers text processing:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
          {`import { parentPort, workerData } from 'node:worker_threads';
import { extractText } from '../services/kb/textExtraction.service.js';

(async () => {
  try {
    const { filePath, mimeType } = workerData;
    const text = await extractText(filePath, mimeType);
    parentPort.postMessage({ ok: true, text });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err?.message || 'extraction failed' });
  }
})();`}
        </code>
      </pre>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.6 Message Contract</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Direction</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Message/Event</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Fields</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Parent &rarr; Worker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Constructor Options</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>workerData</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Object</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Contains target file path and mimeType details</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker &rarr; Parent</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Success response</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>&#123; ok: true, text: "..." &#125;</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Object</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Returns raw extracted document characters</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker &rarr; Parent</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Error response</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>&#123; ok: false, error: "..." &#125;</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Object</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Propagates text extraction failures back to parent</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.7 Knowledge Base Extraction Pipeline</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  participant Controller as kbFile.controller.js
  participant DB as prisma Client
  participant Service as kbChunking.service.js
  participant Worker as kbExtract.worker.js
  participant API as Embeddings API

  Controller->>DB: Create KbFile entry (status: 'pending')
  Controller->>Service: triggerKbProcessing(kbFileId)
  Service->>DB: Update status to 'processing'
  Service->>Worker: Spawn thread and await extraction
  Worker-->>Service: Return plain text
  Service->>Service: Split text into chunks
  Service->>API: Generate embeddings batch (1536-dim)
  Service->>DB: Save KbChunks (executeRaw vectors)
  Service->>DB: Update KbFile status to 'ready'`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.8 PDF / CSV Processing</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Actual parsing logic is defined in `backend/src/services/kb/textExtraction.service.js`:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Supported Mimetypes:</strong> <code>text/plain</code>, <code>text/markdown</code>, <code>text/csv</code>, <code>application/json</code>, and <code>application/pdf</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Libraries:</strong> PDF text is parsed using the <code>pdf-parse</code> library, falling back to a naive regex Tj/TJ scan if pdf-parse fails.</li>
        <li style={{ marginBottom: 6 }}><strong>Limits:</strong> Extraction truncates text beyond 20,000,000 characters (<code>EXTRACT_CHAR_CAP</code>) to guard memory limits.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.9 Worker &rarr; Service Integration</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Once text resolves from the worker thread, control returns to `processKbFile()`. If the document length exceeds 10,000 characters (<code>CHUNK_THRESHOLD_CHARS</code>), the service chunks it (1000 size, 150 overlap) and calls <code>embedBatch()</code>. Chunks are saved to <code>KbChunk</code> inside a Prisma transaction, and the parent <code>KbFile</code>'s status updates to `ready` with <code>chunked = true</code>.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.10 Error Propagation</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  WorkerException[Worker Exception] -->|Post message ok: false| ParentCatch[Parent Promise reject]
  ParentCatch -->|Catch block inside processKbFile| DBFailed[Update KbFile status = failed, embeddingError = err]
  DBFailed -->|Log error via Pino| EndState[Job aborts]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.11 Worker Lifecycle</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan creates a new Worker Thread instance for each text extraction task. The threads are one-shot: they do not run in a persistent pool, nor are they reused across file uploads. Once text extraction finishes (or fails), <code>worker.terminate()</code> is explicitly called by the parent, releasing system resources.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.12 Concurrency</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Worker Thread execution is fire-and-forget and runs concurrently when multiple files are processed. There are no application-level limits capping the number of concurrent extraction worker threads. This is independent of BullMQ concurrency, which is capped by `CAMPAIGN_WORKER_CONCURRENCY`.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.13 Interaction with BullMQ</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Worker Threads and BullMQ are completely independent. Outbound campaigns do not spawn Node worker threads, and Knowledge Base processing is triggered directly via service functions rather than BullMQ task loops.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.14 Interaction with Redis</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The Worker Thread execution path has no connection to or interaction with Redis.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.15 Database Impact</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Model</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Operation</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>When</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>KbFile</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Start of processing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Flips status to <code>'processing'</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`kbChunking.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>KbChunk</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>DELETE &amp; INSERT</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Post extraction completion</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Clears old chunks and batch-inserts vector chunks</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`kbChunking.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>KbFile</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>End of processing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Saves extracted text, sets chunked boolean, sets status to <code>'ready'</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`kbChunking.service.js`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.16 Performance Considerations</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Node worker threads isolate PDF-parsing CPU bottlenecks from the main Node thread. This ensures that parsing a multi-megabyte PDF file does not block the event loop or introduce packet drops to live 20ms WebSocket media Pacings.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.17 Failure &amp; Recovery Matrix</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Current Behaviour</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Database State</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Parser crash</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>worker.once('error')</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Terminates thread and rejects promise</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>status: `failed`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No automatic recovery was identified.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Stuck processing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Boot sweep in `server.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Detects jobs stuck in processing &gt; 30 mins</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Retriggered to `processing`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>resumeStuckKbJobs()</code> runs on startup</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.18 Developer Debugging Guide</h3>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 4 }}>Find the affected file ID by searching the <code>KbFile</code> table.</li>
        <li style={{ marginBottom: 4 }}>Filter stdout logs for <code>KB chunking/embedding failed</code> or the file CUID.</li>
        <li style={{ marginBottom: 4 }}>Inspect the database row's <code>embeddingError</code> field.</li>
      </ol>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.19 Developer Modification Guide</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Adding supported formats:</strong> Update the mime type evaluations in <code>extractText()</code> inside `backend/src/services/kb/textExtraction.service.js`.</li>
        <li style={{ marginBottom: 6 }}><strong>Modifying thread parameters:</strong> Adjust the `workerData` properties inside `kbChunking.service.js`.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.17.20 Code Reference Map</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Repository Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Function / Symbol</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker creation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kbChunking.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>extractInWorker</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Worker entrypoint</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/workers/kbExtract.worker.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>One-shot closure</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Parsing logic</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kb/textExtraction.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>extractText</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Chunking &amp; Schedulers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kbChunking.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>processKbFile</code> / <code>resumeStuckKbJobs</code></td>
          </tr>
        </tbody>
      </table>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.18 Background Schedulers</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.1 Purpose</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan runs multiple background schedulers and startup sweeps to maintain data consistency, perform automated subscription renewals, purge call recordings to prevent disk depletion, recover stalled Knowledge Base chunking operations, and re-arm scheduled campaigns (broadcasts) after server restarts.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.2 Background Process Inventory</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process Name</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Type</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Startup Location</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Trigger</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Frequency</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>integrationScheduler</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Interval Scheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/integrationScheduler.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:69`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>setInterval callback</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Every 60,000ms</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Polls and creates integrations sync jobs</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>voiceSyncScheduler</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Interval Scheduler &amp; Startup Sweep</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/voice/voice.startup.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:70`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>setInterval callback &amp; stale check</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Every 12 hours</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Syncs catalogs from voice providers</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>recordingRetention</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Interval Scheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/recordingRetention.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:74`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>setInterval callback</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Configured via interval variable</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Deletes call recordings and orphan audio files</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>runRenewals</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Interval Scheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/server.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:258`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>setInterval callback</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Every 1 hour (default)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Processes subscription period renewals</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>resumeStuckKbJobs</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Startup Sweep</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kbChunking.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:80`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Server boot execution</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Once on boot</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Resumes stuck KB file extractions</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>sweepDueBroadcasts</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Startup Sweep</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/broadcast/broadcast.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`server.js:86`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Server boot execution</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Once on boot</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Re-arms scheduled broadcasts</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.3 Scheduler Initialization</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Background schedulers are initialized during the HTTP server boot phase inside `backend/src/server.js`.
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  Boot[Server Startup: server.js] -->|Initialize Worker| campaignWorker[campaignWorker]
  Boot -->|Initialize| integration[startIntegrationScheduler()]
  Boot -->|Initialize| voice[startVoiceSyncScheduler()]
  Boot -->|Initialize| retention[startRecordingRetention()]
  Boot -->|Run Sweep| kb[resumeStuckKbJobs()]
  Boot -->|Run Sweep| broadcast[sweepDueBroadcasts()]
  Boot -->|Start Interval| billing[setInterval runRenewals]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.4 Recording Retention Scheduler</h3>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Purpose</h4>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Call recording audio files accumulate on disk. This scheduler limits disk usage by deleting older audio content while leaving DB log records intact to preserve ledger records.
      </p>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Trigger &amp; Frequency</h4>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Triggered via a periodic interval (<code>RECORDING_RETENTION_SWEEP_INTERVAL_MS</code>). A boot sweep is scheduled with a 60-second startup delay.
      </p>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Retention Period</h4>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Configured via <code>RECORDING_RETENTION_DAYS</code> (e.g. 7 days).
      </p>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 6 }}>Selection &amp; Deletion</h4>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
        Iterates in batches of 500 (up to 200 batches). It identifies <code>AgentCallLog</code> rows older than the cutoff, updates their <code>recordingPath</code> and <code>recordingMime</code> values to null in the DB, and unlinks the files on disk. Additionally, it reads disk directory entries and unlinks orphaned files that are older than the cutoff (with a 24-hour orphan grace period).
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`stateDiagram-v2
  [*] --> Idle
  Idle --> Running: Interval Ticks
  Running --> SweepExpired: Nullify DB records & unlink files
  SweepExpired --> SweepOrphans: Scan directory for orphan files
  SweepOrphans --> Idle: Complete`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.5 Knowledge Base Recovery / Resume Scheduler</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If a server process crashes mid-extraction, knowledge base files can become stuck in `pending` or `processing` states. A startup sweep in <code>resumeStuckKbJobs()</code> resolves this:
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  participant Server as server.js startup
  participant DB as prisma Client
  participant Service as kbChunking.service.js

  Server->>Service: Invokes resumeStuckKbJobs()
  Service->>DB: Query files in ['pending', 'processing'] older than 30 mins (STUCK_JOB_AGE_MS)
  DB-->>Service: Stuck file records
  Service->>Service: Loop records and call triggerKbProcessing()
  Service->>DB: Update file status to 'processing' and restart pipeline`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.6 Broadcast / Scheduled Campaign Recovery</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Scheduled broadcasts are tracked in memory using timers. If a deployment occurs, those timers are lost. A startup sweep resolves this by calling <code>sweepDueBroadcasts()</code> in `backend/src/services/broadcast/broadcast.service.js`. It queries the DB for any broadcast scheduled in the past or within 5 minutes of current time that are still in `scheduled` state, and queues them immediately.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.7 Voice Synchronization</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Voice provider synchronization runs automatically in the background to sync catalogs from <code>Google</code>, <code>ElevenLabs</code>, <code>Sarvam</code>, <code>Cartesia</code>, and <code>FishAudio</code>. It runs:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>On startup if voice provider sync is determined to be stale (no sync exists or last sync is older than 12 hours).</li>
        <li style={{ marginBottom: 6 }}>Every 12 hours as a background interval callback.</li>
        <li style={{ marginBottom: 6 }}>Failures are caught, logged, and isolated using <code>Promise.allSettled</code> so that a failure in one provider does not block another.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.8 Scheduler Execution Model</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Mechanism</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Used For</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process Boundary</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Scheduling Method</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Isolation</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>In-process setInterval</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>renewRenewals, voiceSyncScheduler, recordingRetention, integrationScheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Main Node event loop</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Node timers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Wrapped in try/catch (non-fatal)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Startup execution hooks</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>resumeStuckKbJobs, sweepDueBroadcasts</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Main Node process startup</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Boot functions</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logged warnings</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.9 Scheduler Concurrency</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Most schedulers execute sequentially inside the event loop. However, <code>renewDueSubscriptions()</code> is designed to be idempotent to prevent double-charging even if triggers overlap or run concurrently across multiple instances, relying on database constraints for safety. Other schedulers do not implement locks.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.10 Startup Failure Behaviour</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Scheduler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Startup Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Application Continues?</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Retry</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Log</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>resumeStuckKbJobs</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Throws or logs warn</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No retry (waits next reboot)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`KB stuck-job sweep failed`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>sweepDueBroadcasts</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Throws or logs warn</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No retry</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`Scheduled-broadcast sweep failed`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.11 Runtime Failure Behaviour</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Scheduler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Point</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Catch Handler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Retry</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Next Execution</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Persistent State</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>runRenewals</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database query error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Runs next hour</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>No state modification</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>recordingRetention</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Unlink file system error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Logs error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>None</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Runs next interval</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Retains records</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.12 Database Impact</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Model/Table</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Operation</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>recordingRetention</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>AgentCallLog</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sets <code>recordingPath = null</code> and <code>recordingMime = null</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`recordingRetention.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>voiceSyncScheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Voice</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPSERT</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Inserts or updates voice settings in bulk batches</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`voice.sync.service.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>runRenewals</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>Subscription</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>UPDATE</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Advances periods and resets limits</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`subscription.service.js`</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.13 External Service Impact</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>External Service</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Operation</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Trigger</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Behaviour</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>voiceSyncScheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>ElevenLabs, Cartesia, Sarvam, FishAudio</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HTTP GET (fetch voice catalog)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Sync trigger</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Promise.allSettled catches error (skipped)</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.14 Scheduling Configuration</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Configuration</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Default</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Used By</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>RECORDING_RETENTION_DAYS</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`env.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>0 (disabled)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>recordingRetention</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Number of days to keep call recording audio on disk</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>SUBSCRIPTION_RENEWAL_INTERVAL_MS</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`process.env`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>3,600,000 (1 hour)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>runRenewals</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Polling interval for subscription checks</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.15 Server Restart Behaviour</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Restarting the server clears active in-process intervals (timers). However, on server boot, Spandan runs startup sweeps (<code>resumeStuckKbJobs</code>, <code>sweepDueBroadcasts</code>) to catch up on tasks that were dropped or scheduled while the process was offline.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.16 Multi-Instance / Deployment Considerations</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <strong>Potential Operational Concern:</strong> Running multiple instances of the backend (e.g. under PM2 cluster mode) will spawn duplicate interval schedulers. While <code>runRenewals</code> handles this via unique period database indexes, running recording retentions simultaneously on a single filesystem directory may lead to redundant <code>fs.unlink</code> tasks.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.17 Failure &amp; Recovery Matrix</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure Scenario</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Current Behaviour</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Manual Action</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>integrationScheduler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database unreachable</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Catch block logs warn once</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Pauses scheduler execution</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Retries on next tick interval</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Verify database URL connection</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.18 Developer Debugging Guide</h3>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 4 }}>Find the log trace matching the target scheduler name (e.g. <code>Voice sync</code> or <code>Subscription renewal sweep complete</code>).</li>
        <li style={{ marginBottom: 4 }}>Verify the intervals defined in `backend/src/server.js` matching the process triggers.</li>
        <li style={{ marginBottom: 4 }}>Check database row parameters inside `Subscription` or `VoiceProvider` tables.</li>
      </ol>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.19 Adding a New Scheduler</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To register a background process, create a service file under `backend/src/services/` wrapping interval callbacks. Import and trigger initialization inside `backend/src/server.js` before or after HTTP server binding. For complex workloads, prioritize enqueuing a BullMQ task rather than executing inline.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.18.20 Scheduler Code Reference Map</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Repository Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Function / Symbol</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Scheduler initialization</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/server.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Boot level executions</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Recording retention</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/recordingRetention.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>startRecordingRetention</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>KB recovery</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/kbChunking.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>resumeStuckKbJobs</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Broadcast recovery</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/broadcast/broadcast.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>sweepDueBroadcasts</code></td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice synchronization</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/voice/voice.startup.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>startVoiceSyncScheduler</code></td>
          </tr>
        </tbody>
      </table>

      {/* ── 3.19 WEBSOCKET ARCHITECTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.19 WebSocket Architecture</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.19.1 Purpose</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The WebSocket (WSS) architecture provides the persistent, low-latency, bidirectional gateway connecting external PSTN carrier gateways (Twilio, Plivo, Piopiy) or client browsers directly with Spandan's modular or bundled voice agent pipelines. High-frequency call streams depend on this layer to transmit voice frames with sub-100ms round-trip delivery requirements.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.19.2 WebSocket Server &amp; Route Inventory</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>WebSocket Route Pattern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Associated Handler</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Client Type</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Supported Formats</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>/api/v1/workspaces/:workspaceId/agents/:agentId/xai-call</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/webCallRealtime.handler.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>React Web App</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>JSON strings, base64 PCM</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bundled xAI voice web calls</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>/api/v1/workspaces/:workspaceId/agents/:agentId/web-call</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/ws/webCallModularRealtime.handler.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>React Web App</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>JSON strings, base64 PCM</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Modular voice web calls (Deepgram/LLM/TTS)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>/api/v1/twilio-media/:workspaceId/:agentId</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`twilioMediaModular.handler.js` / `twilioMediaRealtime.handler.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio Media Stream</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Base64 8kHz Mulaw packets</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Twilio telephony audio bridge</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>/api/v1/plivo-media/:workspaceId/:agentId</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`plivoMediaModular.handler.js` / `plivoMediaRealtime.handler.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo XML Stream</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Base64 8kHz Mulaw packets</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo telephony audio bridge</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.19.3 Upgrade Matching &amp; Routing Logic</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Upgrade routing is handled within `backend/src/server.js` using path match patterns. Express does not automatically route WebSocket upgrades. On an HTTP upgrade event trigger, the server executes pathname matches to resolve parameters:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>The request path is evaluated against regex matchers to isolate <code>workspaceId</code> and <code>agentId</code>.</li>
        <li style={{ marginBottom: 6 }}>The database is queried via Prisma to confirm agent and workspace validity and retrieve the configured engine types.</li>
        <li style={{ marginBottom: 6 }}>If the agent is configured to use a bundled engine (e.g. ElevenLabs Conversational AI / xAI), the connection upgrade is delegated to <code>twilioMediaRealtime.handler.js</code>. If a modular pipeline is configured, it is routed to <code>twilioMediaModular.handler.js</code>.</li>
        <li style={{ marginBottom: 6 }}>Once resolved, the server issues a status code <code>HTTP 101 Switching Protocols</code> response handshake to initiate the socket stream.</li>
      </ol>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.19.4 Connection Handshake Sequence</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  participant Gateway as Carrier Gateway (Twilio/Plivo)
  participant HTTP as server.js Upgrade Listener
  participant DB as Prisma PostgreSQL
  participant Handler as twilioMediaModular.handler.js
  participant Bridge as modularMediaBridge.js

  Gateway->>HTTP: GET Upgrade Handshake (/api/v1/twilio-media/:workspaceId/:agentId)
  HTTP->>DB: Query agent configuration & workspace balance status
  DB-->>HTTP: Agent active, balance approved
  HTTP-->>Gateway: HTTP 101 Switching Protocols
  HTTP->>Handler: Instantiate modular media handler
  Handler->>Bridge: handleTwilioMediaModularUpgrade(ws)
  Bridge->>Bridge: Start SpeechGate VAD, Pacer, and Deepgram WebSocket
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.19.5 Message Frame Protocols</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Telephony clients stream JSON frames. Spandan expects the following structural schema layouts:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>
          <strong>Start Event Frame:</strong> Sent once by Twilio. Sets the call session ID context keys.
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, marginTop: 4 }}>
            {`{
  "event": "start",
  "streamSid": "MZxxxxxxxxxxxxxxxx",
  "start": { "callSid": "CAxxxxxxxxxxxxxxxx" }
}`}
          </pre>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Media Audio Frame:</strong> Incoming binary audio chunks encoded as base64 raw G.711 mulaw.
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, marginTop: 4 }}>
            {`{
  "event": "media",
  "media": { "payload": "base64encodedmulawaudio..." }
}`}
          </pre>
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Stop Event Frame:</strong> Triggers immediate session teardown, log updates, and database settlement commits.
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, marginTop: 4 }}>
            {`{
  "event": "stop",
  "streamSid": "MZxxxxxxxxxxxxxxxx"
}`}
          </pre>
        </li>
      </ul>


      {/* ── 3.20 REAL-TIME VOICE PIPELINE ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.20 Real-Time Voice Pipeline</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.20.1 End-to-End Execution Trace</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  Gateway[Twilio/Plivo Carrier] -->|Mulaw audio WSS| Bridge[modularMediaBridge.js]
  Bridge -->|Frame stream| VAD[speechGate.js analyzeSpeech]
  VAD -->|If energy > RMS threshold| STT[deepgramStream.service.js]
  STT -->|Transcribed Text| Runtime[agentRuntime.service.js voiceTurnStream]
  Runtime -->|Injected KB Context| LLM[LLM Factory]
  LLM -->|Text Word Stream| Buf[sentenceBuffer.js]
  Buf -->|Complete Clauses| TTS[ttsStreamFactory.js]
  TTS -->|Raw Synthesized Audio| Pacer[ulawPacer.js / pcmStreamPacer.js]
  Pacer -->|Paced base64 payload| Bridge
  Bridge -->|JSON envelope| Gateway
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.20.2 Speech Detection (VAD) &amp; Echo Filtering</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To prevent agent synthesis loops from triggering self-interruption, <code>speechGate.js</code> analyzes incoming audio frame energy and filters loopback echo using <code>isEchoOfAgent()</code>. The pacer sets high-priority playback states during active TTS transmission, and SpeechGate ignores inbound sound levels below the calculated RMS noise threshold.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.20.3 Audio Pacing &amp; Interruption</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Synthesized audio is buffered and paced to exactly 20ms frames (160 bytes of 8kHz mulaw) by <code>ulawPacer.js</code> to match the phone system's buffer size. If user speech is detected mid-sentence, an interruption is triggered. The active turn is cancelled, the pacer queues are cleared, and a <code>clear</code> payload is sent to drop the carrier's playout buffer.
      </p>


      {/* ── 3.21 AGENT RUNTIME ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.21 Agent Runtime</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.21.1 Core Engine</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The orchestrator for voice responses is <code>backend/src/services/agentRuntime.service.js</code>. It loads settings, compiles chat history, interacts with vector databases for RAG queries, and coordinates external tools.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.21.2 Prompt &amp; Variables Context Injection</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system compiles prompts before sending them to the LLM by combining:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Agent System Prompt:</strong> Base system templates and instructions.</li>
        <li style={{ marginBottom: 6 }}><strong>Dynamic Variables:</strong> Workspace properties, time offsets, and contact variables.</li>
        <li style={{ marginBottom: 6 }}><strong>Retrieval-Augmented Generation (RAG):</strong> Cosine similarity matches from vector databases.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.21.3 Dynamic Conversation Sequence</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  participant Bridge as modularMediaBridge.js
  participant Runtime as agentRuntime.service.js
  participant DB as Prisma PostgreSQL
  participant LLM as LLM Factory
  
  Bridge->>Runtime: voiceTurnStream(queryText, agentId, history)
  Runtime->>DB: Fetch agent prompt, voice config & contact info
  Runtime->>DB: Perform vector search for matching Knowledge Base chunks
  Runtime->>Runtime: Construct compiled prompt template
  Runtime->>LLM: Stream completion request
  LLM-->>Runtime: Yield words stream
  Runtime-->>Bridge: Pipeline words into Sentence Buffer
`}
        </pre>
      </div>


      {/* ── 3.22 LLM / STT / TTS PROVIDER SERVICES ───────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.22 LLM / STT / TTS Provider Services</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.22.1 LLM Abstractions</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        LLM connections are decoupled by <code>llm.factory.js</code>. The factory maps provider settings to their specific client libraries (OpenAI, Gemini, Custom API).
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.22.2 STT Streaming Integrations</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Speech-to-Text streaming is managed by <code>deepgramStream.service.js</code>, which opens a persistent connection to Deepgram's API. It handles incoming binary telephony audio frames and yields real-time JSON transcripts.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.22.3 TTS Voice Factories</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The <code>ttsStreamFactory.js</code> is the entry point for voice generation, routing requests to services like ElevenLabs, Cartesia, FishAudio, and Sarvam. If a provider fails, the system propagates the exception up to the turn stream to trigger fallback logic or log an error.
      </p>


      {/* ── 3.23 KNOWLEDGE BASE PROCESSING ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.23 Knowledge Base Processing</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.23.1 Vector Ingestion Lifecycle</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`graph TD
  File[REST POST Upload] -->|Status: pending| DB[Prisma KbFile]
  DB -->|Spawn job| WorkerThread[kbExtract.worker.js]
  WorkerThread -->|pdf-parse / text extraction| PlainText[Raw Extracted text]
  PlainText -->|Capped chunk split| Chunker[splitIntoChunks]
  Chunker -->|Vector embeddings API| Embedder[embeddings.service.js]
  Embedder -->|1536-dim vector arrays| PG[(PgVector Storage <=> Similarity)]
  PG -->|Update Status| Ready[Status: ready]
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.23.2 Chunking &amp; Text Splitting Limits</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The text extraction worker parses documents off the main event loop to avoid voice latency. The plain text is then divided into overlapping chunks based on these rules:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Chunk Size:</strong> Capped at <code>CHUNK_SIZE = 1000</code> characters per vector partition.</li>
        <li style={{ marginBottom: 6 }}><strong>Overlap Boundary:</strong> Configured with <code>CHUNK_OVERLAP = 150</code> characters.</li>
        <li style={{ marginBottom: 6 }}><strong>File Extraction Limit:</strong> Capped at <code>20,000,000</code> characters per document to prevent out-of-memory errors on large files.</li>
      </ul>


      {/* ── 3.24 BILLING & WALLET ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.24 Billing &amp; Wallet</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.24.1 Financial Ledger &amp; Wallet Balance</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Billing balances are managed in cents to prevent precision loss. The <code>Workspace</code> table maintains <code>walletBalance</code> balance caches, while every transaction is logged in <code>WalletTransaction</code> for auditability.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.24.2 Call Ingress Validation Gate</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Before a call is placed or accepted, the billing engine runs <code>assertCanStartCall()</code>. This check requires a positive balance, verifying the workspace has enough funds for at least 10 seconds of conversation. If not, the call is rejected immediately.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.24.3 Webhook Payment Top-up Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
          {`sequenceDiagram
  autonumber
  participant Razorpay as Razorpay API Gateway
  participant Webhook as webhook.controller.js
  participant DB as Prisma PostgreSQL Transaction
  
  Razorpay->>Webhook: POST Webhook Event (HMAC Signature Header)
  Webhook->>Webhook: Validate body payload signature using SHA-256
  alt Signature Verified
    Webhook->>DB: Initiate Prisma $transaction
    DB->>DB: Add amount to Workspace.walletBalance
    DB->>DB: Insert new WalletTransaction ledger record
    DB-->>Webhook: Commit transaction success
  else Invalid signature
    Webhook-->>Razorpay: Return HTTP 400 Bad Request
  end
`}
        </pre>
      </div>


      {/* ── 3.25 API VALIDATION & ERROR HANDLING ─────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.25 API Validation &amp; Error Handling</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.25.1 Schema Ingress Validators</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan validates API payloads at the router boundary using schema validators. It checks and sanitizes body parameters and URL parameters. If validation fails, it blocks execution and returns an HTTP 400 response.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.25.2 Global HTTP Error Handlers</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Runtime exceptions are caught by <code>backend/src/middleware/errorHandler.js</code>. The error handler sanitizes sensitive parameters, records details using Pino, and returns a standardized JSON structure.
      </p>


      {/* ── 3.26 BACKEND OBSERVABILITY & TROUBLESHOOTING ─────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.26 Backend Observability &amp; Troubleshooting</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.26.1 Structured Log Specifications</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan configures structured JSON logging using Pino (<code>backend/src/lib/logger.js</code>). Trace logs are formatted to include system indicators like <code>workspaceId</code>, <code>agentId</code>, and <code>callSid</code>, making it easier to diagnose issues.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.26.2 System Health Indicators</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system exposes status indicators at `/health`. These checks verify database connections and migration status. They return <code>HTTP 500</code> if the check fails.
      </p>


      {/* ── 3.27 BACKEND TESTING ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.27 Backend Testing</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.27.1 Voice and Billing Test Suites</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Tests are written using native Node.js testing tools. They verify pacer timings, VAD thresholds, wallet calculations, and auto-renewal limits:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Test Target</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Dependencies Covered</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Command</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Voice Pacing Tests</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Verifies pacer timings and 20ms chunk splits</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`ulawPacer.js`, `speechGate.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`npm run test:voice`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Wallet Ledger Tests</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Verifies wallet balances, debits, and credits</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`wallet.service.js`, `settlement.service.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`npm run test:billing`</td>
          </tr>
        </tbody>
      </table>


      {/* ── 3.28 BACKEND ENGINEERING REFERENCE ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>3.28 Backend Engineering Reference</h2>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.28.1 Directory Map Reference</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The layout of key directories and files:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>`backend/src/ws/`:</strong> WebSocket handlers and connection bridges (e.g. `modularMediaBridge.js`).</li>
        <li style={{ marginBottom: 6 }}><strong>`backend/src/services/`:</strong> Core business logic, including `agentRuntime.service.js` and provider factory integrations.</li>
        <li style={{ marginBottom: 6 }}><strong>`backend/src/workers/`:</strong> CPU-intensive task handlers, such as `kbExtract.worker.js`.</li>
      </ul>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.28.2 System Startup &amp; Shutdown Lifecycle</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        During startup, the system establishes database connections, initiates the campaign queues, schedules cron jobs, and cleans up any incomplete knowledge extraction tasks. On shutdown, it stops schedulers, closes active WebSocket streams, finishes processing current queue tasks, and disconnects database connections.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 10 }}>3.28.3 Environment Configurations Map</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Config Parameter</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Required</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>DATABASE_URL</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>The PostgreSQL database connection string.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><code>REDIS_URL</code></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Yes</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Connection string for the Redis instance backing the BullMQ queues.</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/architecture" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← 2. Architecture
        </Link>
        <Link to="/docs/developer/database" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          4. Database →
        </Link>
      </div>
    </div>
  );
}
