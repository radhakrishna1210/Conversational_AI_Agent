import { Link } from 'react-router-dom';

export default function DevWorkflow() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>11. Development Workflow</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's codebase workflows, development commands, schema migrations, and local verification loops.
      </p>

      {/* ── 11.1 DEVELOPMENT WORKFLOW OVERVIEW ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.1 Development Workflow Overview</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The feature implementation cycle starts with local branching and configuration, applying model migrations, adding validator constraints, implementing routes/services, and verifying changes through compilation and test suite checks.
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Start[Git Branch] --> Schema[Update schema.prisma]
  Schema --> Mig[Prisma Migrate Dev]
  Mig --> Logic[Add Code Logic & Routes]
  Logic --> Tests[Run node --test Suite]
  Tests --> Build[Vite Client Build]
  Build --> Push[Git Push / PR]
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This flowchart maps the engineering development lifecycle. Developers branch locally, apply database schema changes with `prisma migrate dev`, write application feature code, execute unit tests, compile the Vite production bundle, and push pull requests for review and VPS deployment.
      </p>


      {/* ── 11.2 REPOSITORY WORKFLOW ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.2 Repository Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Developers modify components based on their functional directory location:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>backend/src/</code>: Application business logic, route handlers, validators, and worker modules.</li>
        <li style={{ marginBottom: 6 }}><code>client/src/</code>: Frontend React application pages, reusable components, and docs.</li>
        <li style={{ marginBottom: 6 }}><code>backend/prisma/</code>: Schema blueprints and setup migrations.</li>
      </ul>


      {/* ── 11.3 LOCAL DEVELOPMENT SETUP ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.3 Local Development Setup</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Setting up the workspace requires checking prerequisites, pulling package dependencies, initializing environment configurations, and launching both backend and frontend development servers.
      </p>


      {/* ── 11.4 PREREQUISITES ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.4 Prerequisites</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Ensure these dependency instances are installed locally before launching local servers:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Node.js:</strong> v20.10.0+ (requires Node &gt;= 20.6 to support built-in env file parsing).</li>
        <li style={{ marginBottom: 6 }}><strong>PostgreSQL:</strong> Relational database engine.</li>
        <li style={{ marginBottom: 6 }}><strong>Redis:</strong> Local cache daemon supporting BullMQ workers.</li>
      </ul>


      {/* ── 11.5 DEPENDENCY INSTALLATION ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.5 Dependency Installation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Run clean package installations inside each repository subfolder:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`# Install backend packages
cd backend && npm ci

# Install client packages
cd ../client && npm ci`}
        </code>
      </pre>


      {/* ── 11.6 ENVIRONMENT CONFIGURATION ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.6 Environment Configuration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Copy templates to load local environment configurations:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>Backend: Copy <code>backend/.env.example</code> to <code>backend/.env</code> and configure database connections.</li>
        <li style={{ marginBottom: 6 }}>Client: Uses Vite environment parsing where variables (such as custom routes) are parsed at compilation.</li>
      </ul>


      {/* ── 11.7 STARTING BACKEND ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.7 Starting Backend</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Launch the local API server using this script:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`cd backend
npm run dev`}
        </code>
      </pre>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The script automatically generates Prisma bindings, deploys pending migrations, and binds the server to the configured local port.
      </p>


      {/* ── 11.8 STARTING FRONTEND ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.8 Starting Frontend</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Run the local Vite development server for client styling:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`cd client
npm run dev`}
        </code>
      </pre>


      {/* ── 11.9 DEVELOPMENT STARTUP ORDER ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.9 Development Startup Order</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Start workspace services in this sequence:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>Database &amp; Redis services (Supabase/Docker container or local daemons).</li>
        <li style={{ marginBottom: 6 }}>Express Backend (runs migrations and starts listening on ports).</li>
        <li style={{ marginBottom: 6 }}>Vite Frontend (compiles styling and binds client events).</li>
      </ol>


      {/* ── 11.10 DATABASE DEVELOPMENT WORKFLOW ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.10 Database Development Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Modify schemas cleanly using Prisma CLI commands. Never run <code>db push</code> in production, as schema sync commands discard database table partitions and raw vectors.
      </p>


      {/* ── 11.11 PRISMA CLIENT GENERATION ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.11 Prisma Client Generation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Generate local typing contracts and dependency bindings after altering <code>schema.prisma</code>:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`npm run db:generate`}
        </code>
      </pre>


      {/* ── 11.12 DATABASE MIGRATIONS ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.12 Database Migrations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Generate a migration patch file for local development:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`npm run db:migrate -- --name <migration_name>`}
        </code>
      </pre>


      {/* ── 11.13 SEED / INITIALIZATION WORKFLOW ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.13 Seed / Initialization Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Seed fresh local schemas with mock data using the Prisma seed script:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`npm run db:seed`}
        </code>
      </pre>


      {/* ── 11.14 GIT WORKFLOW ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.14 Git Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Follow standard development workflow steps: Fetch &rarr; Branch &rarr; Implement &rarr; Test &rarr; Commit &rarr; Push.
      </p>


      {/* ── 11.15 BRANCHING STRATEGY ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.15 Branching Strategy</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>Recommended engineering convention — not enforced by repository configuration:</em>
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>feat/&lt;name&gt;</code>: Adding new features (such as integrations or services).</li>
        <li style={{ marginBottom: 6 }}><code>fix/&lt;name&gt;</code>: Resolving bugs, errors, or routing issues.</li>
      </ul>


      {/* ── 11.16 COMMIT CONVENTIONS ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.16 Commit Conventions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>Recommended commit conventions:</em> Use structured message prefixes (such as <code>feat:</code>, <code>fix:</code>, <code>docs:</code>, <code>test:</code>, and <code>refactor:</code>) to keep history clean.
      </p>


      {/* ── 11.17 PULL REQUEST WORKFLOW ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.17 Pull Request Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Pull requests require successful backend test execution and client production builds. Reviewers must confirm database transaction safety and verify correct provider routing.
      </p>


      {/* ── 11.18 CODE ORGANIZATION RULES ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.18 Code Organization Rules</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Align component additions with the existing project architecture:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Backend:</strong> Routes delegate validation to Zod, then pass requests to controllers, which call services for database updates.</li>
        <li style={{ marginBottom: 6 }}><strong>Frontend:</strong> Reusable components live in <code>client/src/components/</code>, and routing views live in <code>client/src/pages/</code>.</li>
      </ul>


      {/* ── 11.19 ADDING A NEW API ENDPOINT ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.19 Adding a New API Endpoint</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a REST API endpoint:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>Define Zod validation schemas in <code>backend/src/validators/</code>.</li>
        <li style={{ marginBottom: 6 }}>Implement controller actions in <code>backend/src/controllers/</code>.</li>
        <li style={{ marginBottom: 6 }}>Register the route path in <code>backend/src/routes/</code>.</li>
        <li style={{ marginBottom: 6 }}>Mount the route under the workspace router in <code>backend/src/routes/index.js</code>.</li>
      </ol>


      {/* ── 11.20 ADDING A NEW SERVICE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.20 Adding a New Service</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Create service files in <code>backend/src/services/</code>. Use Prisma Client instances from <code>backend/src/config/prisma.js</code> to perform transactional queries.
      </p>


      {/* ── 11.21 ADDING A NEW DATABASE MODEL ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.21 Adding a New Database Model</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Define database models in <code>schema.prisma</code>, setting up foreign keys and indexes. Then, run <code>npm run db:migrate</code> and <code>npm run db:generate</code> to apply the changes.
      </p>


      {/* ── 11.22 ADDING A NEW QUEUE / WORKER ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.22 Adding a New Queue / Worker</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Define queue tasks using BullMQ. Initialize workers inside <code>backend/src/workers/</code> and map task execution triggers inside the bootstrap script.
      </p>


      {/* ── 11.23 ADDING A NEW WEBSOCKET HANDLER ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.23 Adding a New WebSocket Handler</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        WebSocket handlers require authentication before initialization. Connect the active socket to the conversation pipeline to process incoming audio streams.
      </p>


      {/* ── 11.24 ADDING A NEW PROVIDER ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.24 Adding a New Provider</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Define provider modules (such as voice models) in <code>backend/src/services/voice/providers/</code>. Register the provider in factory files so it is accessible to the system.
      </p>


      {/* ── 11.25 ADDING A NEW INTEGRATION ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.25 Adding a New Integration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a CRM, calendar, or messaging integration:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>Define validation fields in <code>integrationConnectionUtils.js</code>.</li>
        <li style={{ marginBottom: 6 }}>Implement OAuth or API key validation in <code>integrations.service.js</code>.</li>
        <li style={{ marginBottom: 6 }}>Add sync logic and event handling in <code>integrations.service.js</code>.</li>
      </ol>


      {/* ── 11.26 FRONTEND DEVELOPMENT WORKFLOW ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.26 Frontend Development Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The frontend workspace is configured as a React client built with Vite and TailwindCSS styling.
      </p>


      {/* ── 11.27 ADDING A NEW FRONTEND PAGE ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.27 Adding a New Frontend Page</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Create pages in <code>client/src/pages/</code>. Register the view route and configure layout protection wrappers inside <code>client/src/App.tsx</code>.
      </p>


      {/* ── 11.28 ADDING A NEW COMPONENT ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.28 Adding a New Component</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Define reusable UI components in <code>client/src/components/</code>, importing assets from standard design layouts.
      </p>


      {/* ── 11.29 API INTEGRATION FROM FRONTEND ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.29 API Integration from Frontend</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Client requests use <code>authFetch</code> to query backend endpoints. Authorization tokens and active workspace IDs are managed automatically by the storage wrapper.
      </p>


      {/* ── 11.30 AUTHENTICATION CHANGES ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.30 Authentication Changes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Modifying user authentication rules requires updating token verification middleware in the backend and refreshing the token rotation logic in the client's auth storage wrapper.
      </p>


      {/* ── 11.31 TESTING STRATEGY ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.31 Testing Strategy</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Local changes are verified by running the project's unit and integration tests.
      </p>


      {/* ── 11.32 BACKEND TESTING ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.32 Backend Testing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Execute backend tests using Node's built-in test runner:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`# Run all backend tests
npm run test

# Run voice pipeline tests specifically
npm run test:voice

# Run billing wallet ledger tests
npm run test:billing`}
        </code>
      </pre>


      {/* ── 11.33 FRONTEND TESTING ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.33 Frontend Testing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Automated frontend tests were not verified in the current repository.
      </p>


      {/* ── 11.34 INTEGRATION TESTING ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.34 Integration Testing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Run integration tests using local mock endpoints to verify API structures without executing paid calls to external providers.
      </p>


      {/* ── 11.35 BUILD VERIFICATION ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.35 Build Verification</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Verify that both backend and frontend applications compile cleanly:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`# Verify client build compilation
cd client
npm run build`}
        </code>
      </pre>


      {/* ── 11.36 DEBUGGING WORKFLOW ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.36 Debugging Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To debug errors: Verify environment configurations &rarr; Check backend log output &rarr; Inspect database transactions and Redis queues &rarr; Test with mock adapters to isolate the root cause.
      </p>


      {/* ── 11.37 LOGGING & DIAGNOSTICS ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.37 Logging &amp; Diagnostics</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The backend uses Pino to log events. Adjust log levels in local configuration files to output verbose debug statements during troubleshooting.
      </p>


      {/* ── 11.38 COMMON DEVELOPMENT FAILURES ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.38 Common Development Failures</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Symptom</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Likely Cause</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Resolution</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Backend fails to start</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Port 4000 already bound or missing environment variables</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Run `ss -tlpn | grep 4000` to find conflicts and verify `.env` values.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Prisma migration error</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Database schema mismatch or pooler connection block</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Ensure migrations use port 5432 direct connections.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 11.39 PRE-COMMIT CHECKLIST ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.39 Pre-Commit Checklist</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>Verify that all local files compile cleanly.</li>
        <li style={{ marginBottom: 8 }}>Run `npm run test` to verify that test suites pass.</li>
        <li style={{ marginBottom: 8 }}>Confirm that no sensitive variables are present in the code.</li>
      </ul>


      {/* ── 11.40 PULL REQUEST CHECKLIST ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.40 Pull Request Checklist</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Ensure pull requests explain the proposed features, identify affected components, document database schema updates, and verify that all integration rules pass.
      </p>


      {/* ── 11.41 DEPLOYMENT READINESS CHECKLIST ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.41 Deployment Readiness Checklist</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Before production release: Verify that migrations use direct connections, check Nginx timeouts, test WebSocket connections, and verify that the <code>/health</code> endpoint is accessible.
      </p>


      {/* ── 11.42 ROLLBACK WORKFLOW ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.42 Rollback Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>No automated rollback mechanism was verified.</em> Use git commands on the server to reset to the target commit, pull down dependencies, restore compiled assets from <code>client/dist.old</code>, and restart the PM2 application.
      </p>


      {/* ── 11.43 DEVELOPMENT ENGINEERING GUIDELINES ──────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.43 Development Engineering Guidelines</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Developers must isolate operations within the workspace context, use database transactions for wallet changes, and release unused active WebSocket sessions.
      </p>


      {/* ── 11.44 DEVELOPER REFERENCE ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>11.44 Developer Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Command</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Directory</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`npm run dev`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Starts the Express development server.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`npm run dev`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Starts the local Vite client server.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`npm run test`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Runs the unit and service test suites.</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/integrations" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Integrations
        </Link>
        <Link to="/docs/developer/troubleshooting" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Troubleshooting →
        </Link>
      </div>
    </div>
  );
}
