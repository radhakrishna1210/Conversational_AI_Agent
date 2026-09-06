import { Link } from 'react-router-dom';
import DocsCallout from '../DocsCallout';
import DocsWorkflow from '../DocsWorkflow';
import DocsImage from '../DocsImage';
import DocsScreenshotPlaceholder from '../DocsScreenshotPlaceholder';
import { Key, Shield, RefreshCw, Code } from 'lucide-react';

export default function UserApiKeys() {
  return (
    <div className="docs-article" style={{ maxWidth: '880px', lineHeight: 1.7 }}>
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Account & Billing</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)', marginBottom: 16 }}>API Keys & Developer Access</h1>
      
      <p className="rz-sub-lg" style={{ fontSize: '17px', color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        Generate and manage secret API keys to programmatically trigger outbound calls, query transcripts, and automate workflows via the Spandan REST API.
      </p>

      {/* Workflow Diagram */}
      <DocsWorkflow
        title="API Key Lifecycle & Authentication Flow"
        description="How secret keys are created, securely hashed, used in API requests, and rotated."
        steps={[
          {
            badge: 'STEP 01',
            title: 'Generate Key',
            description: 'Specify a name and environment (Live or Test); receive the raw secret token once.',
            icon: <Key size={16} />
          },
          {
            badge: 'STEP 02',
            title: 'Secure Hashing',
            description: 'Server stores only a SHA-256 cryptographic hash; raw key cannot be recovered.',
            icon: <Shield size={16} />
          },
          {
            badge: 'STEP 03',
            title: 'Bearer Auth',
            description: 'Pass key in the Authorization header to automate calls from your backend.',
            icon: <Code size={16} />
          },
          {
            badge: 'STEP 04',
            title: 'Rotate / Revoke',
            description: 'Instantly rotate compromised keys or revoke access with zero server downtime.',
            icon: <RefreshCw size={16} />
          }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>1. Overview of Workspace API Keys</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        The <strong>API Keys</strong> console (<code style={{ color: 'var(--teal-fg)' }}>/api_keys</code>) allows developers to generate authentication tokens for programmatic platform access.
      </p>

      <DocsImage
        src="/screenshots/Api_keys.png"
        alt="Workspace API Keys Management Console"
        caption="API Keys management console: generate live/test keys, copy secret tokens, and manage access privileges"
      />

      <DocsCallout type="security" title="SECRET REVEAL POLICY">
        The raw secret key is displayed in the browser <strong>exactly once</strong> at the moment of creation. The Spandan database stores only a SHA-256 hash. If you lose the secret, you must rotate the key to generate a new token.
      </DocsCallout>

      <DocsScreenshotPlaceholder
        title="API Keys Management Dashboard"
        description="Create new keys, inspect live vs test environments, copy revealed secrets, track last used timestamps, and rotate keys."
        routePath="/api_keys"
        elements={[
          { label: 'Key Name Input', value: 'Descriptive identifier (e.g. Production Backend)', type: 'input' },
          { label: 'Environment Toggle', value: 'Live (sp_live_...) | Test (sp_test_...)', type: 'button' },
          { label: 'Active Keys Table', value: 'Prefix, Environment, Created Date, Last Used', type: 'text' },
          { label: 'Key Actions', value: 'Rotate Key | Revoke Key', type: 'button' }
        ]}
      />

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 36, marginBottom: 16 }}>2. Step-by-Step: Creating an API Key</h2>

      <ol style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li>Navigate to <strong>API</strong> (<code style={{ color: 'var(--teal-fg)' }}>/api_keys</code>) in the left sidebar.</li>
        <li>Enter a clear <strong>Key Name</strong> (e.g. <em>"Backend CRM Worker"</em>).</li>
        <li>Select the <strong>Environment</strong>:
          <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <li><strong>Live:</strong> Keys prefixed with <code style={{ color: 'var(--teal-fg)' }}>sp_live_</code> for real outbound calling and wallet debits.</li>
            <li><strong>Test:</strong> Keys prefixed with <code style={{ color: 'var(--cyan-fg)' }}>sp_test_</code> for sandboxed testing.</li>
          </ul>
        </li>
        <li>Click <strong>Generate API Key</strong>.</li>
        <li>Copy the revealed secret key immediately and store it securely in your environment variables.</li>
      </ol>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>3. Authenticating REST API Requests</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Pass your secret key in the <code style={{ color: 'var(--teal-fg)' }}>Authorization</code> header as a Bearer token:
      </p>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '24px' }}>
        curl -X POST https://api.spandan.ai/api/v1/workspaces/:workspaceId/campaigns \<br />
        &nbsp;&nbsp;-H "Authorization: Bearer sp_live_9b4e7c1a8f23..." \<br />
        &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
        &nbsp;&nbsp;-d '&#123; "name": "API Outbound Campaign", "botId": "agent_cuid123" &#125;'
      </div>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 40, marginBottom: 16 }}>4. Rotating & Revoking Keys</h2>
      <ul style={{ paddingLeft: 22, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.8 }}>
        <li><strong>Rotate:</strong> Click <strong>Rotate</strong> on any active key. The previous secret ceases to function immediately, and a new token is generated without changing the key's permissions.</li>
        <li><strong>Revoke:</strong> Click <strong>Revoke</strong> to permanently delete the key. Any external system attempting to authenticate with that key receives an immediate HTTP <code style={{ color: 'var(--err)' }}>401 Unauthorized</code> response.</li>
      </ul>

      {/* Navigation Footer */}
      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
        <Link to="/docs/user/billing" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Billing & Prepaid Wallet
        </Link>
        <Link to="/docs/user/troubleshooting" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Troubleshooting Guide →
        </Link>
      </div>
    </div>
  );
}
