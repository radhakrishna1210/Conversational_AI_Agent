import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';

export default function DevSecurity() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Internal Engineering Documentation</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>8. Security</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        This page details Spandan's encryption standards, authentication boundaries, token rotation, authorization rules, and audit logs.
      </p>

      <DocsCallout type="security" title="CREDENTIAL AND TOKEN STORAGE SAFETY">
        Never store secrets or raw JWT signature keys inside source control repositories. Production credentials must load exclusively from environmental parameters or secure volume mappings during deployment.
      </DocsCallout>

      {/* ── 8.1 SECURITY ARCHITECTURE ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.1 Security Architecture &amp; Request Flow</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan implements a multi-layered security architecture protecting backend REST routes, real-time voice pipeline WebSockets, integrations, and administrative actions:
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>A. JWT User Request Security Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  Client[Browser / SPA Client] -->|HTTPS TLS 1.3 Request| Gateway[Express App: app.js]
  Gateway -->|Apply Security Headers & Origin| Helmet[CORS & Helmet Middleware]
  Helmet -->|Extract Bearer Token| AuthMW[authenticate.js Middleware]
  AuthMW -->|Verify Signature & Expiry| ExtractUser[Attach req.user]
  ExtractUser --> WorkspaceMW[workspaceContext.js Middleware]
  WorkspaceMW -->|Verify WorkspaceMember Record| AttachTenant[Attach req.workspace & req.membership]
  AttachTenant --> RoleGuard[authorize.js Role Guard]
  RoleGuard -->|Check Member / Superadmin Role| Controller[Express Controller]
  Controller -->|Execute Domain Service| Service[Domain Service]
  Service -->|Workspace Scoped Query| DB[(PostgreSQL Database)]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This flow diagram depicts how user HTTP requests pass through security guards. TLS requests first pass CORS and Helmet CSP filters, then `authenticate.js` verifies JWT signatures, `workspaceContext.js` attaches tenant context, and `authorize.js` validates membership roles before permitting execution by controllers and database services.
      </p>

      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>B. Developer API Key Security Flow</h3>
      <div style={{ margin: '24px 0', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <pre className="mermaid" style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-primary)' }}>
{`graph TD
  APIClient[Developer / External Server] -->|HTTP Header x-api-key: sk_live_...| Gateway[Express Gateway]
  Gateway --> AuthMW[authenticate.js Middleware]
  AuthMW -->|Detect sk_ Key Prefix| KeySvc[apiKey.service.js]
  KeySvc -->|Compute SHA-256 Hash| HashLookup{Lookup keyHash in ApiKey DB}
  HashLookup -->|Found & Active| AttachKeyWorkspace[Attach Workspace & Environment Context]
  HashLookup -->|Revoked / Invalid| Reject[Return HTTP 401 Unauthorized]
  AttachKeyWorkspace --> Controller[Target Controller / Service]`}
        </pre>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>What this shows</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        This diagram illustrates how developer API keys (`sk_live_...` / `sk_test_...`) are authenticated. `authenticate.js` identifies the key prefix and delegates to `apiKey.service.js`, which computes a SHA-256 hash and looks up active `ApiKey` records in PostgreSQL to bind workspace context without exposing raw secrets.
      </p>


      {/* ── 8.2 AUTHENTICATION ───────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.2 Authentication</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Authentication is performed in <code>backend/src/middleware/authenticate.js</code>:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>Header Extraction:</strong> Credentials are read exclusively from the <code>Authorization: Bearer &lt;token&gt;</code> header to prevent logging credentials.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Route Authentication:</strong> If a token starts with <code>sk_live_</code> or <code>sk_test_</code>, it is authenticated as a workspace API key. Otherwise, it is verified as a user JSON Web Token (JWT).
        </li>
      </ul>


      {/* ── 8.3 PASSWORD AUTHENTICATION ───────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.3 Password Authentication</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Passwords are salted and hashed using <code>bcryptjs</code> with 12 rounds of salting (defined by <code>env.BCRYPT_SALT_ROUNDS</code>) inside <code>backend/src/lib/hash.js</code>. The system enforces minimum password length restrictions (8 characters minimum, 100 maximum, as defined in <code>limits.js</code>). No custom password reset system is implemented.
      </p>


      {/* ── 8.4 GOOGLE OAUTH ─────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.4 Google OAuth</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Google authentication is handled by the <code>googleRedirect</code> and <code>googleCallback</code> methods in <code>backend/src/controllers/auth.controller.js</code>:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>The user initiates login and is redirected to Google OAuth consent pages at <code>accounts.google.com/o/oauth2/v2/auth</code>.</li>
        <li style={{ marginBottom: 6 }}>On success, Google redirects back to <code>/api/v1/auth/google/callback</code> with an authorization code.</li>
        <li style={{ marginBottom: 6 }}>The callback exchanges the code for tokens at <code>oauth2.googleapis.com/token</code> and fetches user profile details from <code>googleapis.com/oauth2/v3/userinfo</code>.</li>
        <li style={{ marginBottom: 6 }}>The user is redirected to the frontend SPA callback page using the URL **fragment** (<code>#</code>) to append the token payload: <code>$&#123;env.CLIENT_URL&#125;/auth/callback#token=...&amp;refreshToken=...</code>. Using the fragment ensures tokens are not sent in server access logs or HTTP Referer headers.</li>
      </ol>


      {/* ── 8.5 JWT & SESSION MANAGEMENT ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.5 JWT &amp; Session Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Tokens are signed using standard JWT secrets inside <code>backend/src/lib/jwt.js</code>:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Access Token Expiry:</strong> 15 minutes (configured via <code>JWT_ACCESS_EXPIRES_IN</code>).</li>
        <li style={{ marginBottom: 6 }}><strong>Refresh Token Expiry:</strong> 7 days (configured via <code>JWT_REFRESH_EXPIRES_IN</code>).</li>
      </ul>


      {/* ── 8.6 REFRESH TOKEN ROTATION & REVOCATION ──────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.6 Refresh Token Rotation &amp; Revocation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan enforces Refresh Token Rotation (RTR). Every token refresh request submitted to <code>/auth/refresh</code> verifies the token, immediately flags the previous record as revoked (<code>revokedAt: new Date()</code>) in the database, and issues a new access/refresh token pair. On logout, the token is revoked in the database.
      </p>


      {/* ── 8.7 AUTHORIZATION & ROLES ────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.7 Authorization &amp; Roles</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Roles are defined in <code>backend/src/constants/roles.js</code>. The system maps two roles:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Role</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Scope</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Access Permitted</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Enforcement Layer</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>`Superadmin`</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Platform</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Full platform administration, wallet overrides, plans, and console bypass.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`isAdmin` middleware inside `authorize.js`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>`Member`</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Workspace</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Standard workspace operations (Agent creation, Campaign runs). No admin console access.</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`authorize('Member')` middleware</td>
          </tr>
        </tbody>
      </table>


      {/* ── 8.8 WORKSPACE / TENANT ISOLATION ─────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.8 Workspace / Tenant Isolation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Tenant isolation is enforced in <code>backend/src/middleware/workspaceContext.js</code>. For all workspace-scoped routes, the middleware checks for a unique membership relation matching the authenticated user ID and the target workspace ID:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`membership = await prisma.workspaceMember.findUnique({
  where: { userId_workspaceId: { userId: req.user.userId, workspaceId } },
  include: { workspace: true },
});`}
        </code>
      </pre>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        If no membership is found, the request fails with a <code>403 Forbidden</code> response. RLS (Row Level Security) is not configured at the PostgreSQL layer.
      </p>


      {/* ── 8.9 API KEYS ─────────────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.9 API Keys</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        API keys are generated in <code>backend/src/lib/hash.js</code> with the prefix <code>sk_live_</code> or <code>sk_test_</code>. Only the SHA-256 hash of the key is stored in the database:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`export const hashToken = (token) => createHash('sha256').update(token).digest('hex');`}
        </code>
      </pre>


      {/* ── 8.10 SECRETS MANAGEMENT ──────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.10 Secrets Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Secrets are loaded from environment variables parsed in <code>backend/src/config/env.js</code>. Key secrets include:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>DATABASE_URL</code> &amp; <code>DIRECT_URL</code> (PostgreSQL connection parameters)</li>
        <li style={{ marginBottom: 6 }}><code>JWT_ACCESS_SECRET</code> &amp; <code>JWT_REFRESH_SECRET</code> (Token signatures keys)</li>
        <li style={{ marginBottom: 6 }}><code>ENCRYPTION_KEY</code> (AES-256 key padding seed)</li>
        <li style={{ marginBottom: 6 }}><code>PLIVO_AUTH_TOKEN</code> (Carrier authentication credentials)</li>
      </ul>


      {/* ── 8.11 ENCRYPTION & CRYPTOGRAPHIC UTILITIES ────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.11 Encryption &amp; Cryptographic Utilities</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Integration credentials (such as OAuth access tokens for Google Sheets, Calendar, or Plivo Subaccount tokens) are encrypted at-rest using <strong>AES-256-CBC</strong> inside <code>backend/src/lib/encryption.js</code>:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Algorithm:</strong> <code>aes-256-cbc</code> using a 16-byte random IV.</li>
        <li style={{ marginBottom: 6 }}><strong>Key derivation:</strong> Padding raw <code>ENCRYPTION_KEY</code> to exactly 32 bytes.</li>
        <li style={{ marginBottom: 6 }}><strong>Storage Format:</strong> Encrypted text is stored in the database as <code>iv_hex:ciphertext_hex</code>.</li>
      </ul>


      {/* ── 8.12 SECURITY MIDDLEWARE ─────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.12 Security Middleware</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Express application filters are configured in <code>backend/src/app.js</code>:
      </p>
      <ol style={{ listStyleType: 'decimal', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Helmet:</strong> Sets browser security headers and configures CSP rules.</li>
        <li style={{ marginBottom: 6 }}><strong>CORS:</strong> Manages cross-origin permissions using an origin validation registry.</li>
        <li style={{ marginBottom: 6 }}><strong>Raw Webhook body limits:</strong> Parses raw bodies for Meta and Razorpay webhook validation before the JSON parser is initialized.</li>
        <li style={{ marginBottom: 6 }}><strong>Body parser limits:</strong> Limits JSON body sizes using <code>env.JSON_BODY_LIMIT</code> to prevent memory exhaustion attacks.</li>
      </ol>


      {/* ── 8.13 CORS & BROWSER SECURITY ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.13 CORS &amp; Browser Security</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        CORS is configured to validate incoming requests against a whitelist of origins:
      </p>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`const clientUrls = env.CLIENT_URL ? env.CLIENT_URL.split(',').map(url => url.trim()) : [];
const localDevOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const allowedOrigins = [...new Set([...clientUrls, ...(env.NODE_ENV !== 'production' ? localDevOrigins : [])])];`}
        </code>
      </pre>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Helmet applies custom Content Security Policy (CSP) headers in production:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><code>scriptSrc</code> whitelists Razorpay and Calendly host domains: <code>checkout.razorpay.com</code>, <code>assets.calendly.com</code>.</li>
        <li style={{ marginBottom: 6 }}><code>connectSrc</code> allows WebSockets (<code>ws:</code>, <code>wss:</code>) to support real-time audio channels.</li>
        <li style={{ marginBottom: 6 }}><code>formAction</code> allows form submission to Razorpay frame endpoints.</li>
      </ul>


      {/* ── 8.14 RATE LIMITING & ABUSE PROTECTION ────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.14 Rate Limiting &amp; Abuse Protection</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Spandan implements rate limiting at the routing layer:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>In-Memory Rate Limiter:</strong> A custom sliding-window rate limiter (<code>backend/src/middleware/rateLimit.js</code>) throttles public endpoints. The OTP sender is limited to 5 requests per minute, and OTP verification is limited to 12 requests per minute.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Redis Rate Limiter:</strong> A Redis-backed rate limiter (<code>backend/src/middleware/rateLimiter.js</code>) is available in the codebase, but is not active in any routes in the current repository.
        </li>
      </ul>


      {/* ── 8.15 INPUT VALIDATION & REQUEST SECURITY ─────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.15 Input Validation &amp; Request Security</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Input validation is enforced using Zod schemas parsed by the <code>validate</code> middleware inside <code>backend/src/middleware/validate.js</code>. The parser sanitizes and parses incoming request properties to prevent injection attacks before controllers process the data.
      </p>


      {/* ── 8.16 WEBHOOK SECURITY ────────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.16 Webhook Security</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Incoming webhooks are verified using cryptographic signature checks:
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Provider</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Endpoint</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Signature Header</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Verification Algorithm</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Razorpay</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/billing/razorpay/webhook`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`X-Razorpay-Signature`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HMAC-SHA256 signature verification over the raw body buffer.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Calendly</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/integrations/webhooks/calendly`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`calendly-webhook-signature`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HMAC-SHA256 signature verification using timingSafeEqual.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Slack</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/integrations/webhooks/slack`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`x-slack-signature`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>HMAC-SHA256 signature verification.</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}><strong>Plivo</strong></td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`/plivo/answer` &amp; `/plivo/hangup`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`X-Plivo-Signature-V3`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Plivo V3 Request Validation using Plivo credentials.</td>
          </tr>
        </tbody>
      </table>


      {/* ── 8.17 DATABASE SECURITY ───────────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.17 Database Security</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Database access is secured using workspace-scoping filters inside controllers. Passwords and API keys are stored exclusively as hashes (using <code>bcrypt</code> and <code>sha256</code> respectively). Row-level encryption is not implemented at the database layer.
      </p>


      {/* ── 8.18 AUDIT LOGGING & COMPLIANCE ──────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.18 Audit Logging &amp; Compliance</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Mutating admin panel actions write audit records to the <code>AuditLog</code> table using the helper in <code>backend/src/services/audit.service.js</code>:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}>
          <strong>No-Fail Policy:</strong> Audit log failures log errors but do not block the target database transaction from completing.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Denormalization:</strong> User email addresses and action labels are denormalized inside the audit rows to preserve history even if the user or workspace is deleted.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong>Redaction:</strong> A regex filter (<code>REDACT_KEYS</code>) strips sensitive keys (such as `password`, `token`, `secret`, and fields ending in `Cipher`) from snapshots before saving.
        </li>
      </ul>


      {/* ── 8.19 SENSITIVE DATA HANDLING ─────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.19 Sensitive Data Handling</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        Sensitive parameters (such as access keys and encryption payloads) are processed using these rules:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 6 }}><strong>Logging:</strong> Critical credential fields are redacted from logger payloads.</li>
        <li style={{ marginBottom: 6 }}><strong>Transit:</strong> Web call WebSockets require token verification during initialization to prevent unauthorized connections.</li>
      </ul>


      {/* ── 8.20 SECURITY FAILURE MODES ──────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.20 Security Failure Modes</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Failure</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Detection Method</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Response Code</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Error Payload</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Invalid / Expired Token</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>verifyAccessToken throws</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`401 Unauthorized`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; error: "Invalid or expired token" &#125;`</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Access denied to Workspace</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>WorkspaceMember check is null</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`403 Forbidden`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`&#123; error: "Not a member of this workspace" &#125;`</td>
          </tr>
        </tbody>
      </table>


      {/* ── 8.21 SECURITY TROUBLESHOOTING ────────────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.21 Security Troubleshooting</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><strong>Webhook Signature Rejections:</strong> Verify that the raw body parser matches the payload structure exactly, as re-serialization formatting differences can cause signature checks to fail.</li>
        <li style={{ marginBottom: 8 }}><strong>Plivo Signature Failures:</strong> Verify that reverse proxy redirect headers do not strip trailing slashes, as Plivo V3 signatures are computed byte-for-byte over request URLs.</li>
      </ul>


      {/* ── 8.22 SECURITY DEVELOPMENT GUIDELINES ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.22 Security Development Guidelines</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
        When introducing new REST endpoints, developers must add the <code>authenticate</code> middleware to authorize requests and the <code>workspaceContext</code> middleware to enforce workspace-level isolation.
      </p>


      {/* ── 8.23 SECURITY ENGINEERING REFERENCE ──────────────────────────── */}
      <h2 className="rz-h2" style={{ fontSize: 20, marginTop: 32, marginBottom: 16 }}>8.23 Security Engineering Reference</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Concern</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Implementation file</th>
            <th style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>Key Method / Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Cryptographic Encryption</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/lib/encryption.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`encryptToken` / `decryptToken` (AES-256-CBC)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Passwords &amp; Key hashing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/lib/hash.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`hashPassword` (Bcrypt) &amp; `hashToken` (SHA-256)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>Capability URL signing</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>`backend/src/services/broadcast/signedToken.js`</td>
            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>`verifyToken` (timingSafeEqual HMAC comparison)</td>
          </tr>
        </tbody>
      </table>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/frontend" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Frontend
        </Link>
        <Link to="/docs/developer/infrastructure" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Infrastructure →
        </Link>
      </div>
    </div>
  );
}
