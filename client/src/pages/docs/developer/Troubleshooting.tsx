import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevTroubleshooting() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>12. System Troubleshooting &amp; Logging</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Verified troubleshooting matrix for backend startup issues, WebSocket connection failures, database pool exhaustion, and JWT session drops, alongside logging architecture guides.
      </p>

      {/* ── 12.1 LOGGING ARCHITECTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>12.1 Logging &amp; Debugging Flow Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan manages application events using the <code>pino</code> library inside the backend. Logs stream directly to standard output (stdout), which is captured by PM2 in production:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Problem[Production Failure / Issue Reported] --> IsRunning{Is Backend PM2 Process Running?}
  IsRunning -->|No| PM2Check[Execute pm2 status & pm2 restart convai-voice-api]
  IsRunning -->|Yes| PM2Logs[Execute pm2 logs --lines 200]
  
  PM2Logs --> Layer{Identify Failure Subsystem}
  Layer -->|API Route Error| APILayer[Inspect Controllers & Zod Validators]
  Layer -->|Database Lock / Pool Exhaustion| DBLayer[Inspect Prisma PgBouncer & Advisory Locks]
  Layer -->|Redis / BullMQ Failure| QueueLayer[Inspect BullMQ campaign-dispatch & Redis URL]
  Layer -->|Campaign Worker Crash| WorkerLayer[Inspect campaign.worker.js Exception Traces]
  Layer -->|WebSocket Call Drop| WSCallLayer[Inspect modularMediaBridge.js & Carrier Payload]
  Layer -->|Provider Timeout| VendorLayer[Inspect LLM / STT / TTS API Keys & Fallbacks]

  APILayer --> Fix[Locate Source Code -> Reproduce -> Fix & Verify]
  DBLayer --> Fix
  QueueLayer --> Fix
  WorkerLayer --> Fix
  WSCallLayer --> Fix
  VendorLayer --> Fix`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This debugging decision flow guides developers through production failure isolation. It checks process status via PM2, streams log outputs, isolates issues into 6 specific subsystem layers (API, Database, Redis Queue, Campaign Worker, WebSocket Media Bridge, or Vendor Providers), and steps through source reproduction and verification.
      </p>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Logging Levels</h3>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>fatal:</strong> Unhandled process-level crash scenarios (e.g., database connection timeouts at startup).</li>
        <li style={{ marginBottom: 6 }}><strong>error:</strong> Actionable runtime transaction exceptions (e.g., payment webhook verification failures).</li>
        <li style={{ marginBottom: 6 }}><strong>warn:</strong> Caught recoverable errors (e.g., secondary LLM fallback triggers).</li>
        <li style={{ marginBottom: 6 }}><strong>info:</strong> System lifecycle milestones (e.g., enqueuing campaigns, websocket upgrades).</li>
        <li style={{ marginBottom: 6 }}><strong>debug:</strong> Detailed query footprints (enabled only in local `development` mode).</li>
      </ul>

      <DocsCallout type="security" title="SENSITIVE DATA LOGGING LAWS">
        Never log raw passwords, access tokens, API secret keys, Google profile user codes, or credit card values. Ensure all custom logs redact sensitive inputs before piping payload snapshots to logger instances.
      </DocsCallout>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 20, marginBottom: 8 }}>Production Log Access</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
        Access the live logging stream directly on the production VPS console via PM2:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 12, borderRadius: 6, overflowX: 'auto', marginBottom: 24 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
{`# Stream live combined logs
pm2 logs convai-voice-api

# Stream error logs only
pm2 logs convai-voice-api --err

# View last 500 lines of logs
pm2 logs convai-voice-api --lines 500`}
        </code>
      </pre>

      {/* ── 12.2 VERIFIED TROUBLESHOOTING MATRIX ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>12.2 Verified Troubleshooting Matrix</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Symptom</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Solution</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Relevant Log / File</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>DATABASE SCHEMA IS NOT MIGRATED</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Fresh database instance missing Prisma tables.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Run `npm run predev` in `backend/` to execute `prisma-migrate-deploy.js`.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/server.js:35`](file:///backend/src/server.js#L35)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>EADDRINUSE: address already in use :::4000</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Background Node process holding port 4000 open.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Kill the background process: `Get-Process node | Stop-Process` on Windows.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/src/server.js:228`](file:///backend/src/server.js#L228)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>WebSocket 1006 / Instant Call Drop</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Nginx proxy missing WebSocket Upgrade headers.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Add `proxy_set_header Upgrade $http_upgrade;` to Nginx config.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`Nginx location block`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Customer Bounced to /login Every 15 min</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Bypassed token refresh handler.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensure API call uses `authFetch.ts` or `whapi.ts` which automatically replays requests on 401.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`client/src/lib/authFetch.ts`](file:///client/src/lib/authFetch.ts)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Prisma Advisory Lock Error</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Supabase PgBouncer pooler blocking lock.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensure `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` env var is set.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>[`backend/scripts/prisma-migrate-deploy.js`](file:///backend/scripts/prisma-migrate-deploy.js)</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/dev-workflow" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Workflow
        </Link>
        <Link to="/docs/developer/codebase-reference" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Codebase Reference →
        </Link>
      </div>
    </div>
  );
}
