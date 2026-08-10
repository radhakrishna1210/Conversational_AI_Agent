import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { whapi } from '../lib/whapi';
import { RzCard, RzEmpty, RzPill, RzSkeleton } from '@/components/rz';

/**
 * API keys — the panel from Spandan Account.dc.html#api.
 *
 * The page used to render one hard-coded row of bullet characters with buttons
 * that did nothing. It is now wired to `/api-keys`, which has existed on the
 * server the whole time: list, create, rotate and revoke.
 *
 * The raw secret comes back from the server exactly once, on create and on
 * rotate — the database only ever stores its hash. That is why the new key is
 * held in component state and shown in a dismissible banner rather than being
 * refetched: after this render, nobody can recover it.
 */

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const relative = (iso: string | null) => {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [environment, setEnvironment] = useState<'live' | 'test'>('live');
  const [revealed, setRevealed] = useState<{ name: string; rawKey: string } | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    whapi
      .get<ApiKey[]>('/api-keys')
      .then(r => setKeys(Array.isArray(r) ? r : []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load API keys'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Give the key a name so you can tell them apart later.'); return; }
    setCreating(true);
    try {
      const res = await whapi.post<ApiKey & { rawKey: string }>('/api-keys', { name, environment });
      setRevealed({ name: res.name, rawKey: res.rawKey });
      setNewName('');
      load();
      toast.success('Key created — copy it now, it is not shown again.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the key');
    } finally {
      setCreating(false);
    }
  };

  const rotate = async (k: ApiKey) => {
    if (!confirm(`Rotate "${k.name}"? The current secret stops working immediately.`)) return;
    try {
      const res = await whapi.post<ApiKey & { rawKey: string }>(`/api-keys/${k.id}/rotate`, {});
      setRevealed({ name: res.name, rawKey: res.rawKey });
      load();
      toast.success('Key rotated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rotate the key');
    }
  };

  const revoke = async (k: ApiKey) => {
    if (!confirm(`Revoke "${k.name}"? Anything using it will start getting 401s.`)) return;
    try {
      await whapi.del(`/api-keys/${k.id}`);
      setKeys(prev => prev.filter(x => x.id !== k.id));
      toast.success('Key revoked');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the key');
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Clipboard blocked — select the text and copy manually');
    }
  };

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap" style={{ maxWidth: 920 }}>
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Account</div>
            <h1 className="rz-h1">API keys</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 620 }}>
              Authenticate the REST and streaming API. Treat these like passwords — a key carries the full
              permissions of this workspace.
            </p>
          </div>
        </div>

        {/* One-time secret. Deliberately loud and deliberately dismissible: it
            cannot be recovered once this banner is gone. */}
        {revealed && (
          <div
            className="rz-card rz-enter"
            style={{ borderColor: 'rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.06)', marginBottom: 16 }}
          >
            <div className="rz-between" style={{ marginBottom: 10 }}>
              <div className="rz-title" style={{ color: 'var(--lime)' }}>Copy “{revealed.name}” now</div>
              <button className="rz-icon-btn" onClick={() => setRevealed(null)} aria-label="Dismiss">✕</button>
            </div>
            <p className="rz-sub" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
              This is the only time the full secret is shown. We store a hash, so we cannot show it again.
            </p>
            <div className="rz-cluster-sm" style={{ flexWrap: 'nowrap' }}>
              <code
                className="rz-input"
                style={{ fontFamily: 'var(--ff-m)', fontSize: 12.5, overflowX: 'auto', whiteSpace: 'nowrap' }}
              >
                {revealed.rawKey}
              </code>
              <button className="rz-btn rz-btn-primary" onClick={() => copy(revealed.rawKey)}>Copy</button>
            </div>
          </div>
        )}

        <RzCard size="lg">
          <div className="rz-between" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div>
              <div className="rz-title" style={{ fontSize: 17 }}>Your keys</div>
              <div className="rz-sub" style={{ marginTop: 4 }}>
                {keys.length} active {keys.length === 1 ? 'key' : 'keys'}
              </div>
            </div>
            <div className="rz-cluster-sm">
              <input
                className="rz-input"
                style={{ width: 200 }}
                placeholder="Key name, e.g. Production"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              />
              <select className="rz-select" style={{ width: 'auto' }} value={environment} onChange={(e) => setEnvironment(e.target.value as any)}>
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
              <button className="rz-btn rz-btn-primary" onClick={create} disabled={creating}>
                {creating ? 'Creating…' : '+ Create key'}
              </button>
            </div>
          </div>

          {loading ? (
            <RzSkeleton rows={2} height={62} />
          ) : error ? (
            <div className="rz-between" style={{ color: 'var(--err)', fontSize: 13 }}>
              <span>{error}</span>
              <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={load}>Retry</button>
            </div>
          ) : keys.length === 0 ? (
            <RzEmpty
              title="No keys yet"
              text="Create one to call the API from your own backend, a script, or an integration."
            />
          ) : (
            <div className="rz-stack-sm">
              {keys.map(k => (
                <div
                  key={k.id}
                  className="rz-key-row"
                  style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}
                >
                  <span className="rz-mark" style={{ width: 34, height: 34 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="rz-cluster-sm" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx)' }}>{k.name}</span>
                      <RzPill tone={k.environment === 'test' ? 'warn' : 'ok'}>{k.environment}</RzPill>
                    </div>
                    <div className="rz-mono-xs rz-truncate" style={{ marginTop: 2 }}>
                      {k.keyPrefix}••••••••••••••••
                    </div>
                  </div>
                  <div className="rz-mono-xs" style={{ textAlign: 'right', lineHeight: 1.6 }}>
                    created {relative(k.createdAt)}<br />last used {relative(k.lastUsedAt)}
                  </div>
                  <div className="rz-cluster-sm" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                    <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={() => rotate(k)}>Rotate</button>
                    <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={() => revoke(k)}>Revoke</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </RzCard>

        <div className="rz-card rz-card-lg" style={{ background: 'var(--bg-2)', marginTop: 16 }}>
          <div className="rz-label" style={{ marginBottom: 10 }}>Quick start</div>
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--ff-m)',
              fontSize: 12.5,
              color: 'var(--tx-2)',
              lineHeight: 1.7,
              overflowX: 'auto',
            }}
          >{`curl https://api.spandan.ai/v1/calls \\
  -H "Authorization: Bearer sk_live_••••" \\
  -d agent_id=riya_receptionist \\
  -d to=+14155550148`}</pre>
          <div className="rz-cluster-sm" style={{ marginTop: 16 }}>
            <Link className="rz-btn rz-btn-secondary rz-btn-sm" to="/documentation">Read the docs</Link>
            <Link className="rz-btn rz-btn-ghost rz-btn-sm" to="/docs">API reference</Link>
          </div>
        </div>
      </div>

      <style>{`
        .rz-key-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto auto;
          gap: 14px;
          align-items: center;
        }
        @media (max-width: 720px) {
          .rz-key-row { grid-template-columns: 34px minmax(0, 1fr); }
          /* The timestamps and the action pair each take the full width below
             the name rather than being squeezed into unreadable columns. */
          .rz-key-row > :nth-child(3),
          .rz-key-row > :nth-child(4) { grid-column: 1 / -1; text-align: left; justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}
