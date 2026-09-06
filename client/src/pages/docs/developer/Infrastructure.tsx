import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevInfrastructure() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>9. Infrastructure</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        A complete guide to Spandan's production server setups, Nginx reverse proxy configurations, PM2 process management, database connections, and migration deployments.
      </p>

      <DocsCallout type="warning" title="PRODUCTION SECURITY GUIDELINES">
        Ensure no production `.env` files or API secrets are stored inside public folders or committed to repository branches. Production environments must load credentials via system variables or protected directory mappings on the VPS host.
      </DocsCallout>

      {/* ── 9.1 INFRASTRUCTURE OVERVIEW ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.1 Deployment Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan runs on a Linux virtual private server (VPS). Nginx terminates TLS certificates, serves built static client assets directly, and proxies REST/WebSocket traffic to PM2-managed Node application instances:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Internet[Internet Visitors & Telephony Carriers] -->|DNS spandan.mannmate.com| Nginx[Nginx Reverse Proxy & Certbot SSL :443]
  Nginx -->|Serve Static SPA Assets| ClientDist[client/dist Static Build]
  Nginx -->|Proxy REST & WSS Upgrade| PM2[PM2 Cluster: convai-voice-api Node :4000/:4300]
  
  PM2 -->|Prisma PgBouncer :6543| Postgres[(PostgreSQL DB)]
  PM2 -->|ioredis Queue & Cache| Redis[(Local Redis Daemon)]
  PM2 -->|HTTPS REST & WSS| Providers[External Providers: Twilio, Plivo, Deepgram, OpenAI, ElevenLabs]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This deployment architecture diagram maps production runtime topology. Nginx terminates SSL certificates, serving compiled React frontend files directly from disk while proxying REST API calls and WebSocket media streams to Node.js backend processes managed by PM2 (`ecosystem.config.cjs`), connected to PostgreSQL, Redis, and external AI/telephony APIs.
      </p>

      {/* ── 9.2 DEPLOYMENT PROCESS ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.2 Production Deployment Process</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Deployments execute via [`deploy/vps/deploy.sh`](file:///deploy/vps/deploy.sh), automating git synchronization, database migration deployment, frontend compilation, PM2 reloads, and health checks:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  autonumber
  actor Dev as Developer
  participant Git as GitHub Repository
  participant VPS as VPS SSH Host (deploy.sh)
  participant DB as PostgreSQL DB
  participant Client as React Vite Client
  participant PM2 as PM2 Process Manager
  participant Nginx as Nginx Proxy

  Dev->>Git: git push origin main
  Dev->>VPS: Execute ./deploy/vps/deploy.sh
  VPS->>Git: git pull origin main
  VPS->>VPS: npm install (backend & client)
  VPS->>DB: node scripts/prisma-migrate-deploy.js
  VPS->>Client: npm run build (Vite compilation)
  VPS->>PM2: pm2 reload ecosystem.config.cjs --update-env
  VPS->>Nginx: sudo systemctl reload nginx
  VPS->>VPS: curl http://localhost:4000/api/v1/health (Health Check)`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence diagram documents the verified VPS deployment pipeline. Running `deploy.sh` pulls the latest main branch, installs node dependencies, applies production Prisma database migrations via `prisma-migrate-deploy.js`, builds static client assets, reloads PM2 instances seamlessly with updated environment variables, reloads Nginx, and validates backend health endpoints.
      </p>


      {/* ── 9.3 ENVIRONMENT ARCHITECTURE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.3 Environment Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan supports two primary environments:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Local Development:</strong> Runs on port <code>4000</code> for the backend server and Vite dev server on port <code>5173</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Production (Hostinger VPS):</strong> Runs on port <code>4300</code> mapped to domain <code>spandan.mannmate.com</code>.</li>
      </ul>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        No dedicated staging infrastructure was verified in the current repository.
      </p>


      {/* ── 9.4 LOCAL DEVELOPMENT ENVIRONMENT ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.4 Local Development Environment</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Local development requires Node.js v20.6+ and running instances of PostgreSQL and Redis. Running <code>npm run dev</code> inside <code>backend/</code> runs the Express application, while the client is served via the Vite server by running <code>npm run dev</code> inside <code>client/</code>.
      </p>


      {/* ── 9.5 STAGING ENVIRONMENT ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.5 Staging Environment</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        No dedicated staging infrastructure was verified in the current repository.
      </p>


      {/* ── 9.6 PRODUCTION ENVIRONMENT ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.6 Production Environment</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The production environment runs on the VPS under process control:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Process Target:</strong> The PM2 application configuration runs under the name <code>convai-voice-api</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>Routing Port:</strong> The application is configured to listen on port <code>4300</code>.</li>
      </ul>


      {/* ── 9.7 SERVER / VPS ARCHITECTURE ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.7 Server / VPS Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Server boot environments are initialized using <code>deploy/vps/bootstrap.sh</code>, which installs server dependencies:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Component</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Installation Method</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Node.js</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>NVM v20.10.0+ (pdf-parse requires Node &gt;=20.16.0)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Runtime engine</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PM2</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Global npm package installation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Application process manager</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>System apt package installation</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>BullMQ task broker</td>
          </tr>
        </tbody>
      </table>


      {/* ── 9.8 NETWORK ARCHITECTURE ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.8 Network Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Nginx terminates external TLS/HTTPS connections on port <code>443</code> and proxies HTTP traffic locally to the Node.js application process on port <code>4300</code>. Internal outbound routes connect to Supabase (PostgreSQL), the local Redis daemon, and external APIs (such as Plivo, Deepgram, and OpenAI).
      </p>


      {/* ── 9.9 NGINX REVERSE PROXY ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.9 Nginx Reverse Proxy</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Nginx configurations are located in <code>deploy/vps/nginx/spandan.mannmate.com.conf</code>:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Body Size Limit:</strong> <code>client_max_body_size 12m</code> is set to support large file uploads (such as PDF files for RAG parsing) while allowing for request headers and multipart boundary metadata.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>CORS and Headers:</strong> Proxied requests pass standard headers including <code>X-Real-IP</code>, <code>Host</code>, and <code>X-Forwarded-For</code>.
        </li>
      </ul>


      {/* ── 9.10 WEBSOCKET PROXYING ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.10 WebSocket Proxying</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        WebSocket proxy configurations are mapped to live media streams (such as `/api/v1/twilio-media/` and `/api/v1/plivo-media/` routes):
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`location ~ ^/api/v1/workspaces/[^/]+/agents/[^/]+/(xai-call|web-call)$ {
    proxy_pass http://127.0.0.1:4300;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}`}
        </code>
      </pre>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To prevent connections from closing during active calls, proxy timeout values are set to <code>3600s</code>. Setting <code>proxy_buffering off</code> ensures that audio packets are transmitted immediately to minimize call latency.
      </p>


      {/* ── 9.11 APPLICATION PROCESS MANAGEMENT ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.11 Application Process Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The backend application runs as a PM2 process named <code>convai-voice-api</code>, configured in <code>ecosystem.config.cjs</code>.
      </p>


      {/* ── 9.12 PM2 CONFIGURATION ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.12 PM2 Configuration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        PM2 app parameters are defined in the ecosystem configuration file:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Setting</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Value</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Rationale / Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`instances`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>1</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Runs in a single instance to prevent duplicate execution of background workers, cron schedulers, and session routing maps.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`exec_mode`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>"fork"</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Fork mode avoids cluster synchronization issues for WebSocket sessions.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`max_memory_restart`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>"1200M"</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Restarts the process if memory usage exceeds 1.2GB to resolve potential memory leaks.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 9.13 POSTGRESQL / SUPABASE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.13 PostgreSQL / Supabase</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The PostgreSQL database is hosted on Supabase. Outbound application requests connect to Supabase over SSL using connection credentials loaded from environment variables.
      </p>


      {/* ── 9.14 PGBOUNCER & CONNECTION MANAGEMENT ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.14 PgBouncer &amp; Connection Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Supabase's PgBouncer pooler executes transactional queries on port <code>6543</code> using the <code>DATABASE_URL</code> connection string. Direct schema changes and migrations connect on port <code>5432</code> using the <code>DIRECT_URL</code> connection string to avoid pooler session lock constraints.
      </p>


      {/* ── 9.15 REDIS INFRASTRUCTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.15 Redis Infrastructure</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        A password-protected Redis instance is installed on the VPS, configured in <code>/etc/redis/redis.conf</code>. Redis is used as the message broker for BullMQ worker queues, which process campaign tasks and asynchronous knowledge base extraction jobs.
      </p>


      {/* ── 9.16 BUILD & STATIC ASSET SERVING ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.16 Build &amp; Static Asset Serving</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        During deployments, the client SPA is built into the <code>client/dist</code> directory. In production, this directory is served statically from the Express process backend using <code>express.static</code>:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
}`}
        </code>
      </pre>


      {/* ── 9.17 ENVIRONMENT CONFIGURATION ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.17 Environment Configuration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Production configurations are loaded from <code>/root/apps/convai-voice/shared/.env</code>. Key environment variables include:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>DATABASE_URL</code> &amp; <code>DIRECT_URL</code> (PostgreSQL connection parameters)</li>
        <li style={{ marginBottom: 6 }}><code>REDIS_URL</code> (Redis connection string)</li>
        <li style={{ marginBottom: 6 }}><code>JWT_ACCESS_SECRET</code> &amp; <code>JWT_REFRESH_SECRET</code> (Token signatures)</li>
        <li style={{ marginBottom: 6 }}><code>ENCRYPTION_KEY</code> (Credential encryption key)</li>
      </ul>


      {/* ── 9.18 DEPLOYMENT PROCESS ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.18 Deployment Process</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        VPS deployments run the pipeline defined in <code>deploy/vps/deploy.sh</code>:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Pull codebase changes:</strong> Runs <code>git reset --hard</code> to align the directory with the remote repository branch.</li>
        <li style={{ marginBottom: 6 }}><strong>Install dependencies:</strong> Installs required packages by running <code>npm ci</code> with dev dependencies enabled.</li>
        <li style={{ marginBottom: 6 }}><strong>Deploy schema updates:</strong> Runs Prisma migrations.</li>
        <li style={{ marginBottom: 6 }}><strong>Build client:</strong> Compiles frontend assets into the <code>client/dist</code> folder.</li>
        <li style={{ marginBottom: 6 }}><strong>Reload application process:</strong> PM2 reloads the application.</li>
        <li style={{ marginBottom: 6 }}><strong>Run health check:</strong> Confirms the deployment succeeded by checking the <code>/health</code> endpoint.</li>
      </ol>


      {/* ── 9.19 DATABASE MIGRATION DURING DEPLOYMENT ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.19 Database Migration During Deployment</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Migrations run during the deployment pipeline before the application process reloads. The deployment script runs the migration script using <code>DIRECT_URL</code>, bypassing PgBouncer connection limits:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy`}
        </code>
      </pre>


      {/* ── 9.20 SSL / TLS ───────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.20 SSL / TLS</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        External HTTPS connections are terminated at Nginx. Let's Encrypt certificates are renewed using <code>certbot</code> configurations.
      </p>


      {/* ── 9.21 LOGGING & MONITORING ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.21 Logging &amp; Monitoring</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Application logs are processed using Pino and written to the <code>/root/apps/convai-voice/logs/</code> directory:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>api-out.log</code>: Standard application output.</li>
        <li style={{ marginBottom: 6 }}><code>api-error.log</code>: Error details and exception traces.</li>
      </ul>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Logs are rotated periodically using <code>pm2-logrotate</code>.
      </p>


      {/* ── 9.22 HEALTH CHECKS ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.22 Health Checks</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The health endpoint is located at <code>/health</code>. The endpoint returns a JSON payload: <code>&#123; status: "ok", timestamp: "..." &#125;</code>.
      </p>


      {/* ── 9.23 BACKGROUND PROCESSES ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.23 Background Processes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Background tasks are processed using BullMQ workers and Express interval schedulers:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Process</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Trigger / Interval</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Recording Retention</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Interval: `RECORDING_RETENTION_SWEEP_INTERVAL_MS`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Deletes expired recording audio files.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign Dispatcher</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>BullMQ task broker</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Initiates campaign calls.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 9.24 BACKUPS & DATA RECOVERY ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.24 Backups &amp; Data Recovery</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Automated backup and restore procedures were not verified in the current repository.
      </p>


      {/* ── 9.25 FAILURE MODES & RECOVERY ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.25 Failure Modes &amp; Recovery</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Impact</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Recovery Mechanism</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express Application Crash</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PM2 process check</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Disconnects WebSocket connections and drops active calls.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>PM2 automatically restarts the process (up to 10 retry attempts).</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Redis Connection Loss</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>BullMQ exception triggers</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Pauses active campaigns.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Campaign workers attempt to reconnect to the Redis server.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 9.26 INFRASTRUCTURE TROUBLESHOOTING ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.26 Infrastructure Troubleshooting</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>Health Check Failures during deploy:</strong> Check that port 4300 is not bound to another app, and inspect active configurations inside `shared/.env`.</li>
        <li style={{ marginBottom: 8 }}><strong>Client build OOM errors:</strong> Ensure the VPS has at least 1.2GB free memory, or deploy with the <code>--skip-client</code> flag to bypass client building.</li>
      </ul>


      {/* ── 9.27 INFRASTRUCTURE DEVELOPMENT GUIDELINES ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.27 Infrastructure Development Guidelines</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When introducing environment variables, update the <code>.env.vps.example</code> template to ensure variables are configured during production deployment.
      </p>


      {/* ── 9.28 INFRASTRUCTURE ENGINEERING REFERENCE ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>9.28 Infrastructure Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Service</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Port Mapping</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Access Exposure</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express Application Backend</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`4300`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Internal (Proxied via Nginx)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Supabase PgBouncer pooler</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`6543`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>External connection mapping</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Supabase Direct PostgreSQL</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`5432`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>External connection mapping</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/security" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Security
        </Link>
        <Link to="/docs/developer/integrations" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Integrations →
        </Link>
      </div>
    </div>
  );
}
