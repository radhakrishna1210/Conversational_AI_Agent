import { Link } from 'react-router-dom';

export default function DevQuickstart() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Developer Guide</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>Developer Quick Start</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Learn how to install the Spandan SDK, configure authentication, and place your first automated voice call in less than 5 minutes.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Step 1: Install the SDK</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Install the package using your favorite package manager:
      </p>
      
      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>npm install @spandan/sdk</code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Step 2: Obtain API Keys</h2>
      <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>Log in to your Spandan Dashboard.</li>
        <li style={{ marginBottom: 8 }}>Navigate to the **API Keys** tab in the sidebar.</li>
        <li style={{ marginBottom: 8 }}>Click **Create API Key**, copy the secret token, and save it in a safe place.</li>
      </ol>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Step 3: Trigger a Voice Call</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Initialize the SDK and trigger an outbound voice conversation:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`import { SpandanClient } from '@spandan/sdk';

// 1. Initialize client
const spandan = new SpandanClient({
  apiKey: process.env.SPANDAN_API_KEY
});

// 2. Trigger an outbound call
async function startVoiceCall() {
  try {
    const call = await spandan.calls.create({
      agentId: "cmrs3ghv30000ynblkry7mltz", // Agent ID from Dashboard
      to: "+919876543210",                  // Recipient's phone number
      from: "+19897689172"                  // Your purchased Twilio phone number
    });

    console.log(\`Successfully triggered call. ID: \${call.id}\`);
  } catch (error) {
    console.error("Failed to place call:", error.message);
  }
}

startVoiceCall();`}
        </code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>Step 4: Check Call Logs</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        Once the call is completed, head over to the **Call Logs** tab in your dashboard to view:
      </p>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}>Complete transcript audio playback.</li>
        <li style={{ marginBottom: 8 }}>Call duration, cost breakdown, and end reason.</li>
        <li style={{ marginBottom: 8 }}>Action items extracted from the conversation.</li>
      </ul>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/user/team" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← Workspace & Team
        </Link>
        <Link to="/docs/developer/sdk" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Client SDK Reference →
        </Link>
      </div>
    </div>
  );
}
