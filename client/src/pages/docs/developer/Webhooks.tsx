import { Link } from 'react-router-dom';

export default function DevWebhooks() {
  return (
    <div className="docs-article">
      <div className="rz-eyebrow-pill" style={{ marginBottom: 12 }}>Developer Guide</div>
      <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 16 }}>Webhooks Integration</h1>
      
      <p className="rz-sub-lg" style={{ marginBottom: 24 }}>
        Configure HTTP Webhooks to receive real-time updates when phone calls are completed, transcripts generated, or balances changed.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>1. What are Webhooks?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Webhooks allow Spandan to push JSON payloads to your application server. Instead of polling our API for call completion updates, specify an endpoint URL to receive HTTP POST payloads when events fire.
      </p>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>2. Supported Events</h2>
      <ul style={{ listStyleType: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        <li style={{ marginBottom: 8 }}><code>call.initiated</code>: Triggered when a call starts dialing.</li>
        <li style={{ marginBottom: 8 }}><code>call.completed</code>: Triggered when the call is hung up, containing final transcripts, duration, and billing costs.</li>
        <li style={{ marginBottom: 8 }}><code>call.failed</code>: Triggered if the carrier line is busy, unreachable, or gets rejected.</li>
      </ul>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>3. Event Payload Example</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        When a call completes, Spandan delivers the following JSON POST request to your webhook URL:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`{
  "event": "call.completed",
  "timestamp": "2026-08-22T02:00:15.123Z",
  "data": {
    "callId": "call-123",
    "agentId": "agent-uuid-456",
    "to": "+919999988888",
    "from": "+19897689172",
    "durationSeconds": 45,
    "costUSD": 0.0152,
    "endReason": "customer_hangup",
    "transcript": [
      {
        "speaker": "agent",
        "text": "Hi, I'm calling from Spandan. Is this a good time to talk?"
      },
      {
        "speaker": "user",
        "text": "Sorry, I am busy right now, please call later."
      }
    ],
    "customVars": {
      "discountCode": "SAVE20"
    }
  }
}`}
        </code>
      </pre>

      <h2 className="rz-h2" style={{ fontSize: 22, marginTop: 32, marginBottom: 16 }}>4. Secure Webhooks (Verifying Signatures)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Every webhook request carries a `Spandan-Signature` HTTP header computed using a HMAC-SHA256 hash of the request body with your webhook signing secret:
      </p>

      <pre style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, overflowX: 'auto', marginBottom: 28 }}>
        <code style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
{`import crypto from 'crypto';

function verifyWebhook(payload, receivedSignature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
    
  return hash === receivedSignature;
}`}
        </code>
      </pre>

      <div className="docs-nav-buttons" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 40 }}>
        <Link to="/docs/developer/api-reference" className="rz-btn rz-btn-secondary" style={{ textDecoration: 'none' }}>
          ← REST API Reference
        </Link>
        <Link to="/docs/developer/knowledge-base" className="rz-btn rz-btn-primary" style={{ textDecoration: 'none' }}>
          Knowledge Base API →
        </Link>
      </div>
    </div>
  );
}
