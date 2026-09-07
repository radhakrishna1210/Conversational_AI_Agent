import { Link } from 'react-router-dom';

export default function DevApiReference() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>REST API Reference</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Direct HTTP endpoints for initiating calls, configuring agents, managing campaigns, and checking health status.
      </p>

      {/* ── API OVERVIEW & ROUTING FLOW ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>API Pipeline Overview</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        All REST API requests pass through uniform security, validation, and serialization gates before returning responses:
      </p>

      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph LR
    Client[Client Request] --> Auth[JWT Signature Validation]
    Auth --> Workspace[Workspace Scope Check]
    Workspace --> Zod[Zod Payload Verification]
    Zod --> Controller[Controller Logic]
    Controller --> Service[Service Execution]
    Service --> Response[JSON Serialization]`}
        </pre>
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Authentication</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        User routes authenticate using short-lived JWT access tokens passed in the header:
        <br />
        <code>Authorization: Bearer &lt;access_token&gt;</code>.
        <br /><br />
        External programmatic requests authenticate using permanent workspace API keys:
        <br />
        <code>Authorization: Bearer sk_live_&lt;prefix&gt;.&lt;secret&gt;</code>.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Endpoints</h2>

      {/* Endpoint: Login */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: '#10b981', color: '#080d18', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>POST</span>
          <code style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>/api/v1/auth/login</code>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
          Authenticates email/password credentials and issues fresh access and refresh token pairs.
        </p>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Request Body</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', marginBottom: 16 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`{
  "email": "user@example.com",
  "password": "securepassword123"
}`}
          </code>
        </pre>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Response (200 OK)</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', margin: 0 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`{
  "token": "eyJhbGciOi...",
  "refreshToken": "df873fa8...",
  "user": {
    "id": "usr-123",
    "name": "Jane Doe",
    "email": "user@example.com",
    "planName": "Free"
  }
}`}
          </code>
        </pre>
      </div>

      {/* Endpoint: Get Agents */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>GET</span>
          <code style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>/api/v1/workspaces/:workspaceId/agents</code>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
          Retrieves a list of all configured conversational voice agents scoped inside the target workspace.
        </p>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Response (200 OK)</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', margin: 0 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`[
  {
    "id": "agent-123",
    "workspaceId": "ws-456",
    "name": "Outbound Booking Assistant",
    "welcomeMessage": "Hello! I am calling from Spandan. How can I help you?",
    "aiModel": "gemini-1.5-flash",
    "voice": "eleven_rachel",
    "maxDuration": 30
  }
]`}
          </code>
        </pre>
      </div>

      {/* Endpoint: Trigger Calls */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: '#10b981', color: '#080d18', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>POST</span>
          <code style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>/api/v1/workspaces/:workspaceId/calls</code>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
          Triggers an outbound voice conversation. Bypasses queues to initiate dials immediately.
        </p>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Request Body</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', marginBottom: 16 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`{
  "agentId": "agent-123",
  "to": "+919999988888",
  "from": "+19897689172",
  "customVars": {
    "discountCode": "SAVE20",
    "customerName": "John"
  }
}`}
          </code>
        </pre>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Response (201 Created)</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', margin: 0 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`{
  "id": "call-log-876",
  "status": "queued",
  "to": "+919999988888",
  "createdAt": "2026-08-22T02:00:00Z"
}`}
          </code>
        </pre>
      </div>

      {/* Endpoint: Health Check */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>GET</span>
          <code style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>/health</code>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px' }}>
          Public health-check. Validates Node runtime state and SQL database availability.
        </p>
        <h4 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '0 0 8px' }}>Response (200 OK)</h4>
        <pre style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 6, overflowX: 'auto', margin: 0 }}>
          <code style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
{`{
  "status": "ok",
  "timestamp": "2026-08-22T02:00:00Z"
}`}
          </code>
        </pre>
      </div>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <span></span>
        <Link to="/docs/developer/dev-workflow" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Workflow →
        </Link>
      </div>
    </div>
  );
}
