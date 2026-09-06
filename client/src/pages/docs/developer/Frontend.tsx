import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevFrontend() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>7. Frontend Architecture</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's React 18 single-page application structure, state management, route guards, API client interceptors, and Server-Sent Events (SSE).
      </p>

      <DocsCallout type="note" title="FRONTEND DESIGN SYSTEM">
        All frontend dashboard views leverage a unified visual hierarchy containing consistent page layouts, custom styling variables, responsive navigation controls, and live SSE event streams.
      </DocsCallout>

      {/* ── 7.1 FRONTEND ARCHITECTURE OVERVIEW ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.1 Frontend Internal Architecture &amp; Component Topology</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan's client layer is built as a Single-Page Application (SPA) using React 18, TypeScript, and Vite. The internal component structure and transport handlers are organized cleanly across client boundaries:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Main[main.tsx Application Entry] --> App[App.tsx Root Component]
  App --> Router[React Router v6 Router]
  
  subgraph Route Tree
    Router --> Public[Public Routes: Login, Signup, Docs]
    Router --> Protected[Protected Workspace Routes: Dashboard, Agents, Campaigns]
    Router --> Admin[Superadmin Routes: Platform Console]
  end

  Public --> Pages[Page Views / Layouts]
  Protected --> Pages
  Admin --> Pages
  
  Pages --> Components[Reusable UI Components & Modals]
  Components --> State[React State & Auth Context]
  
  subgraph Client Communication Transports
    State --> REST[REST API Clients: authFetch.ts / whapi.ts]
    State --> SSE[SSE Client: sseClient.ts]
    State --> WS[WebSocket Realtime Call Client]
  end`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram maps Spandan's internal frontend component hierarchy and communication channels. It traces execution from `main.tsx` and `App.tsx` through React Router route groups down to page layouts, UI components, state managers, and the 3 client transports (REST API wrappers `authFetch.ts`/`whapi.ts`, Server-Sent Events `sseClient.ts`, and WebSocket real-time voice calls).
      </p>


      {/* ── 7.2 TECHNOLOGY STACK ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.2 Technology Stack</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Frontend dependency packages are configured in <code>client/package.json</code>:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Technology</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Version</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>React</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>^18.2.0</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Component rendering and interface lifecycle.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>TypeScript</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>^5.2.2</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Static type checking.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Vite</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>^5.2.0</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Build tool and development server bundle engine.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>React Router DOM</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>^6.22.3</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Client-side SPA routing tree management.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 7.3 APPLICATION ENTRY POINT ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.3 Application Entry Point</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The client interface bootstraps from <code>client/src/main.tsx</code>. It mounts the React application root using <code>createRoot</code>, imports global styles (such as <code>index.css</code>), and registers the main component wrapper.
      </p>


      {/* ── 7.4 APPLICATION BOOTSTRAP ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.4 Application Bootstrap</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When a user visits the site, the browser executes the compiled bundle, mounting <code>main.tsx</code>. The script initializes global settings and passes control to <code>App.tsx</code> to resolve client routes.
      </p>


      {/* ── 7.5 APPLICATION COMPONENT HIERARCHY ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.5 Application Component Hierarchy</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The application structure routes components through layout wrappers:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`main.tsx
└── App
    ├── Router
    │   ├── Public (Login, Docs)
    │   ├── DashboardLayout (Workspace console, Agents)
    │   └── DocsLayout (Internal Dev Docs)`}
        </code>
      </pre>


      {/* ── 7.6 LAYOUT ARCHITECTURE ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.6 Layout Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Layout wrappers manage the structure and navigation of different sections:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>DashboardLayout:</strong> Renders the sidebar navigation panel and header controls. It loads the active workspace variables and injects content using <code>&lt;Outlet /&gt;</code>.</li>
        <li style={{ marginBottom: 6 }}><strong>DocsLayout:</strong> Serves the developer documentation pages, providing sidebar links and table-of-contents components.</li>
      </ul>


      {/* ── 7.7 ROUTING ARCHITECTURE ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.7 Routing Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Client-side routing is configured in <code>client/src/App.tsx</code> using the <code>&lt;Routes&gt;</code> component from <code>react-router-dom</code> to manage view paths.
      </p>


      {/* ── 7.8 ROUTE INVENTORY ──────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.8 Route Inventory</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Path</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Access Protection</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/login`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Public</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Authentication login view.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Protected (Member/Admin)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Workspace dashboard console.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/docs/developer/*`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Developer Guard (Superadmin)</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Internal developer documentation.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 7.9 ROUTE PROTECTION ─────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.9 Route Protection</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Guards enforce client-side access controls (Note: Front-end route protection is a UI control helper, not a backend security boundary):
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>`AdminRoute`:</strong> Guards administrative features, validating that the user is logged in and has the `Superadmin` role.</li>
        <li style={{ marginBottom: 6 }}><strong>`DeveloperDocsRoute`:</strong> Guards internal developer documentation paths, redirecting unauthorized users to the public docs page.</li>
      </ul>


      {/* ── 7.10 AUTHENTICATION STATE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.10 Authentication State</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The client retrieves the active authentication state by reading stored variables (such as <code>token</code>, <code>refreshToken</code>, and <code>userRole</code>) from the auth storage manager.
      </p>


      {/* ── 7.11 AUTHENTICATION LIFECYCLE ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.11 Authentication Lifecycle</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When the user logs in, the API returns a token pair. The token is appended to the headers of authenticated requests. If a request yields a <code>401</code>, the client attempts to refresh the access token:
      </p>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`sequenceDiagram
  Client App->>Backend API: Request with expired token
  Backend API-->>Client App: 401 Unauthorized
  Client App->>Backend API: POST /auth/refresh with Refresh Token
  Backend API-->>Client App: Returns rotated token pair
  Client App->>Backend API: Replays original request
`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This sequence diagram demonstrates `authFetch.ts` 401 error handling. When an API call returns HTTP 401 Unauthorized due to an expired access token, the client interceptor automatically invokes `/api/v1/auth/refresh`, updates local storage tokens, and replays the original API request transparently without user disruption.
      </p>


      {/* ── 7.12 TOKEN STORAGE ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.12 Token Storage</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The storage wrapper (<code>client/src/lib/authStorage.ts</code>) writes authentication tokens to <code>localStorage</code>. If local storage is blocked (such as in private browsing sessions), it falls back to <code>sessionStorage</code> to prevent errors.
      </p>


      {/* ── 7.13 API CLIENT ARCHITECTURE ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.13 API Client Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The client interface manages API requests using two primary transports:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>authFetch:</strong> A global fetch wrapper that handles authorization headers and token refreshes.</li>
        <li style={{ marginBottom: 6 }}><strong>whapi:</strong> A workspace-scoped client that prefixes paths with the active workspace ID.</li>
      </ul>


      {/* ── 7.14 AUTHFETCH ───────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.14 authFetch</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The <code>authFetch</code> client (<code>client/src/lib/authFetch.ts</code>) wraps the native fetch API. It appends the Bearer token to requests and manages the token refresh and request replay logic. It also serializes token refresh operations (using <code>refreshInFlight</code>) to prevent concurrent refresh requests from invalidating rotated tokens.
      </p>


      {/* ── 7.15 WORKSPACE API CLIENT ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.15 Workspace API Client</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The <code>whapi</code> client (<code>client/src/lib/whapi.ts</code>) manages workspace-scoped operations. It retrieves the active workspace ID and constructs the request path:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`const { token, workspaceId } = getAuth();
const url = \`/api/v1/workspaces/\${workspaceId}\${path}\`;`}
        </code>
      </pre>


      {/* ── 7.16 API REQUEST LIFECYCLE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.16 API Request Lifecycle</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Requests follow this execution path: The user interacts with a page or component &rarr; The component calls the API client (such as <code>whapi.get('/agents')</code>) &rarr; The client appends the token and workspace ID &rarr; The backend returns the response &rarr; The component updates state and renders the new data.
      </p>


      {/* ── 7.17 API ERROR HANDLING ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.17 API Error Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If a request fails, the API client parses the response payload, extracts the error code and message, and throws an error that can be caught by the calling component.
      </p>


      {/* ── 7.18 DATA FETCHING & CACHING ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.18 Data Fetching &amp; Caching</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>Note: The client does not use a global caching library (such as React Query or TanStack Query).</em> Components retrieve data using direct fetch requests and manage response data in local component state.
      </p>


      {/* ── 7.19 GLOBAL STATE ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.19 Global State</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Global workspace parameters (such as the active workspace ID, user credentials, and user role) are stored in the auth storage wrapper, which serves as the single source of truth for global state.
      </p>


      {/* ── 7.20 LOCAL COMPONENT STATE ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.20 Local Component State</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Views manage UI state (such as active modals, pagination offsets, loading states, and form inputs) using local React hooks (<code>useState</code> and <code>useMemo</code>).
      </p>


      {/* ── 7.21 CUSTOM HOOKS ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.21 Custom Hooks</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Components use custom hooks to manage specific behaviors:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>useOutsideClick</code>: Detects clicks outside active modals and dropdown menus.</li>
        <li style={{ marginBottom: 6 }}><code>useVoiceState</code>: Coordinates WebRTC audio session state during live test calls.</li>
      </ul>


      {/* ── 7.22 REAL-TIME UPDATES ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.22 Real-Time Updates</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The client interface uses Server-Sent Events (SSE) to receive real-time updates (such as active campaign progress and call logs) from the backend.
      </p>


      {/* ── 7.23 SERVER-SENT EVENTS ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.23 Server-Sent Events</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The SSE client is defined in <code>client/src/lib/sseClient.ts</code>. It uses the standard fetch API instead of native <code>EventSource</code> to allow appending Authorization headers. The client parses the event stream, handles reconnections with exponential backoff, and provides a close handle to terminate the connection.
      </p>


      {/* ── 7.24 REAL-TIME UI UPDATE FLOW ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.24 Real-Time UI Update Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Real-time updates flow as follows: The backend dispatches an SSE event &rarr; The <code>openSseStream</code> handler receives the event stream &rarr; The client dispatches the data to listeners &rarr; The component updates local state and re-renders.
      </p>


      {/* ── 7.25 PAGE ARCHITECTURE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.25 Page Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The page directory (<code>client/src/pages/</code>) is organized by feature area, containing authentication views, workspace dashboards, agent configurations, and documentation pages.
      </p>


      {/* ── 7.26 COMPONENT ARCHITECTURE ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.26 Component Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        UI components (<code>client/src/components/</code>) are decoupled from page logic, focusing on rendering data tables, styling forms, and managing navigation layouts.
      </p>


      {/* ── 7.27 REUSABLE UI COMPONENTS ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.27 Reusable UI Components</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The interface leverages reusable UI elements, including data tables (with sorting and pagination), form fields, and modal containers.
      </p>


      {/* ── 7.28 FORMS & VALIDATION ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.28 Forms &amp; Validation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Forms use local state to track inputs. The client performs input validation (such as checking required fields and email formats) before dispatching requests to the API.
      </p>


      {/* ── 7.29 LOADING / EMPTY / ERROR STATES ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.29 Loading / Empty / Error States</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Components manage loading and error states locally, displaying skeleton loaders during data fetch operations and inline error messages if a request fails.
      </p>


      {/* ── 7.30 MODAL & OVERLAY ARCHITECTURE ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.30 Modal &amp; Overlay Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Modals (such as the agent creation dialog) are rendered conditionally based on boolean state flags managed by the parent page or component.
      </p>


      {/* ── 7.31 NOTIFICATIONS & USER FEEDBACK ───────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.31 Notifications &amp; User Feedback</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The system displays inline toast notifications to provide user feedback when operations (such as saving configurations or starting campaigns) succeed or fail.
      </p>


      {/* ── 7.32 STYLING ARCHITECTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.32 Styling Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The styling system uses vanilla CSS variables configured in <code>client/src/index.css</code>. Layout coordinates leverage Tailwind CSS utility classes to manage responsive layouts and alignment.
      </p>


      {/* ── 7.33 THEME SYSTEM ────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.33 Theme System</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The interface uses CSS variables to manage theme properties (such as background colors and border styling), supporting dark-mode rendering based on user preferences.
      </p>


      {/* ── 7.34 RESPONSIVE DESIGN ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.34 Responsive Design</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Layout components use responsive Tailwind grid and flexbox utility classes, adapting sidebar and content panels to match standard tablet and desktop widths.
      </p>


      {/* ── 7.35 ASSETS & STATIC FILES ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.35 Assets &amp; Static Files</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Static assets (such as logos and fonts) are stored in the <code>client/public/</code> directory and served directly by the Vite development server.
      </p>


      {/* ── 7.36 DOCUMENTATION FRONTEND ARCHITECTURE ─────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.36 Documentation Frontend Architecture</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The documentation subsystem (<code>client/src/pages/docs/</code>) uses layout wrappers (such as <code>DocsLayout</code>) to provide navigation sidebars, search functionality, and code block formatting.
      </p>


      {/* ── 7.37 DEVELOPER DOCUMENTATION ACCESS ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.37 Developer Documentation Access</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Internal developer documentation routes (<code>/docs/developer/*</code>) are protected on the client. The route guard validates that the visitor has active Superadmin privileges, redirecting other users to the public docs page.
      </p>


      {/* ── 7.38 USER DOCUMENTATION ACCESS ───────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.38 User Documentation Access</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Public user documentation pages are accessible to all visitors without authentication.
      </p>


      {/* ── 7.39 FRONTEND BUILD SYSTEM ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.39 Frontend Build System</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        The frontend uses Vite to compile assets. Running <code>npm run build</code> triggers the TypeScript compiler and bundles output files into the <code>client/dist</code> folder.
      </p>


      {/* ── 7.40 DEVELOPMENT WORKFLOW ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.40 Development Workflow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To modify the frontend: Launch the Vite development server using <code>npm run dev</code>, verify layout changes in the browser, and run the build command to ensure the code compiles cleanly.
      </p>


      {/* ── 7.41 ADDING A NEW PAGE ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.41 Adding a New Page</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add a page: Create the component in <code>client/src/pages/</code>, register the route path in <code>App.tsx</code>, and update navigation configurations to include links to the new page.
      </p>


      {/* ── 7.42 ADDING A NEW ROUTE ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.42 Adding a New Route</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Routes are registered inside <code>App.tsx</code>. Select the appropriate layout wrapper and apply the <code>AdminRoute</code> guard if the route requires administrative privileges.
      </p>


      {/* ── 7.43 ADDING A NEW COMPONENT ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.43 Adding a New Component</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Define components in <code>client/src/components/</code>, using TypeScript interfaces to enforce strict props checking.
      </p>


      {/* ── 7.44 ADDING A NEW API INTEGRATION ────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.44 Adding a New API Integration</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Use the <code>whapi</code> client helper to connect to workspace-scoped backend API endpoints, mapping the response payload to local component state.
      </p>


      {/* ── 7.45 ADDING REAL-TIME UPDATES ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.45 Adding Real-Time Updates</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To add real-time updates: Initialize the SSE connection using <code>openSseStream</code>, define the event type listener, and update component state when new data events arrive.
      </p>


      {/* ── 7.46 FRONTEND DEBUGGING ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.46 Frontend Debugging</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        To troubleshoot client-side errors: Inspect the browser console for JavaScript exceptions, check the Network tab to verify request payloads, and audit the local storage state to confirm active credentials.
      </p>


      {/* ── 7.47 FRONTEND FAILURE MODES ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.47 Frontend Failure Modes</h2>
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
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Token refresh loop</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Invalid or expired refresh token stored in storage</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Clear stored keys and redirect the user to the login page.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>SSE disconnects</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Connection timeout or server-side process restart</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>The client automatically attempts to reconnect using exponential backoff.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 7.48 PERFORMANCE CONSIDERATIONS ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.48 Performance Considerations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Components optimize renders by using <code>useMemo</code> hooks for complex calculations and lazy-loading heavy data tables to manage client memory usage.
      </p>


      {/* ── 7.49 TESTING ─────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.49 Testing</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        <em>No automated frontend test suite was verified in the repository.</em>
      </p>


      {/* ── 7.50 FRONTEND ENGINEERING REFERENCE ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.50 Frontend Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Component / File</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Purpose</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Source Path Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Token Storage</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Manages local storage tokens and fallback sessionStorage</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client/src/lib/authStorage.ts`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>SSE Connection</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Receives real-time update events via custom HTTP stream</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`client/src/lib/sseClient.ts`</td>
          </tr>
        </tbody>
      </table>


      {/* ── 7.51 TROUBLESHOOTING MATRIX ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>7.51 Troubleshooting Matrix</h2>
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
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Blank Screen on Startup</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>JavaScript runtime compilation error or broken asset path</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Open browser Developer Tools to check console error logs.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>API returns 401</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Expired tokens or failed refresh request</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Clear stored keys and redirect the user to the login page.</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/websockets" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← WebSockets
        </Link>
        <Link to="/docs/developer/security" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Security →
        </Link>
      </div>
    </div>
  );
}
