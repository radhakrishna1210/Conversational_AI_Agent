import { Link } from 'react-router-dom';

export default function DevSdk() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Developer Guide</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>Spandan Client SDK</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Programmatic SDK reference for managing voice calls, fetching records, and handling real-time audio streams.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Client Initialization</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Import and configure the `SpandanClient` with your options:
      </p>
      
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`import { SpandanClient } from '@spandan/sdk';

const client = new SpandanClient({
  apiKey: 'spandan_live_abc123...', // Your Workspace Secret Key
  timeout: 10000,                  // Timeout in ms (default is 15000)
  maxRetries: 3                    // Number of API retry attempts
});`}
        </code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Call Operations</h2>

      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>1. Trigger Outbound Call</h3>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 20 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
{`const call = await client.calls.create({
  agentId: "agent-id",
  to: "+1234567890",
  from: "+1098765432",
  customVars: {
    customerName: "Jane Doe",
    invoiceDue: "$150.00"
  }
});`}
        </code>
      </pre>

      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>2. Retrieve Specific Call Record</h3>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 20 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
{`const callDetails = await client.calls.get("call-id-12345");
console.log("Call status:", callDetails.status); // 'completed', 'failed', 'busy'
console.log("Recording URL:", callDetails.recordingUrl);`}
        </code>
      </pre>

      <h3 style={{ fontSize: 18, color: 'var(--text-primary)', marginTop: 24, marginBottom: 12 }}>3. List Historical Call Logs</h3>
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 20 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
{`const logs = await client.calls.list({
  limit: 20,
  page: 1,
  status: "completed"
});`}
        </code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Voice over Web Call (WebRTC Websocket)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Initiate a voice conversation directly inside the web browser without any telephony networks:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`import { SpandanWebCall } from '@spandan/sdk/web';

const callSession = new SpandanWebCall({
  agentId: "agent-id",
  token: "client-jwt-auth" // JWT token generated via server-side SDK
});

// Register Event Listeners
callSession.on('connected', () => console.log('Audio socket open!'));
callSession.on('speaking', (role) => console.log(\`\${role} is speaking...\`));
callSession.on('transcript', (msg) => console.log(\`Received transcript: \${msg.text}\`));

// Begin capture and call
callSession.start();

// Terminate call
// callSession.stop();`}
        </code>
      </pre>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/quickstart" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Developer Quick Start
        </Link>
        <Link to="/docs/developer/api-reference" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          REST API Reference →
        </Link>
      </div>
    </div>
  );
}
