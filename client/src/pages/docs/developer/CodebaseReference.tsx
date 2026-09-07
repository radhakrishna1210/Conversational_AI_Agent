import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevCodebaseReference() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>13. Codebase Reference</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        A quick reference index listing key directories, services, workers, and configuration paths across the monorepo.
      </p>

      <DocsCallout type="tip" title="QUICK FILE INSPECTION">
        You can inspect any database models inside [`backend/prisma/schema.prisma`](file:///backend/prisma/schema.prisma) or locate business-critical controller handles inside [`backend/src/controllers/`](file:///backend/src/controllers/).
      </DocsCallout>

      {/* ── 13.1 MONOREPO DIRECTORY MAP ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>13.1 Monorepo Directory Map</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan's codebase is structured as a monorepo partitioned into `backend/` and `client/` trees:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Repo[Spandan Monorepo Root]
  
  subgraph Backend ["backend/ Directory"]
    B_Config[config/ DB & Redis]
    B_Controllers[controllers/ HTTP Handlers]
    B_Middleware[middleware/ Auth & Tenancy]
    B_Routes[routes/ REST Router]
    B_Services[services/ Domain Logic & Factories]
    B_Workers[workers/ BullMQ & Worker Threads]
    B_Queues[queues/ BullMQ Producers]
    B_WS[ws/ Realtime Audio Bridges]
    B_Prisma[prisma/ schema.prisma]
  end

  subgraph Client ["client/ Directory"]
    C_Comp[components/ UI Widgets]
    C_Hooks[hooks/ Custom React Hooks]
    C_Lib[lib/ API & Auth Clients]
    C_Pages[pages/ SPA Views & Docs]
    C_Styles[styles/ CSS Variables]
  end

  Repo --> Backend
  Repo --> Client`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This repository directory map illustrates the project monorepo structure. The `backend/` subtree contains API configuration singletons, middleware, controllers, services, queues, workers, WebSocket bridges, and Prisma schemas, while the `client/` subtree organizes React components, custom hooks, API transport libraries, and documentation pages.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>13.2 Important Directories</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Directory Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/controllers/`](file:///backend/src/controllers/)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express endpoint controllers handling HTTP payloads.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/services/`](file:///backend/src/services/)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Core business logic (wallet billing, campaigns, CRM syncs, voice engines).</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/ws/`](file:///backend/src/ws/)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Real-time WebSocket audio bridges (Twilio, Plivo, WebCall).</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/workers/`](file:///backend/src/workers/)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>BullMQ campaign queue workers and CPU worker threads.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`client/src/pages/docs/`](file:///client/src/pages/docs/)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>React TSX components for platform User and Developer documentation.</td>
          </tr>
        </tbody>
      </table>

      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>13.2 Important Core Files</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>File Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/server.js`](file:///backend/src/server.js)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Server entrypoint: HTTP server, DB connectivity check, WebSocket upgrade matchers.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/src/app.js`](file:///backend/src/app.js)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Express app configuration: CORS, Helmet CSP, raw webhook body parsers, SPA fallback.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`backend/prisma/schema.prisma`](file:///backend/prisma/schema.prisma)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Prisma ORM database models, relations, and indexes definitions.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`client/src/App.tsx`](file:///client/src/App.tsx)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Client router mapping, layout wrappers, and role guards.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>[`client/src/lib/authFetch.ts`](file:///client/src/lib/authFetch.ts)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Authenticated fetch transport client with automatic JWT refresh replay.</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/troubleshooting" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Troubleshooting &amp; Logging
        </Link>
        <span></span>
      </div>
    </div>
  );
}
