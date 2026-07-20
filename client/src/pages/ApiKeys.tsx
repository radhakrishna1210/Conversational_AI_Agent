import { useState, useEffect, useRef } from 'react';
import { whapi } from '../lib/whapi';
import { isAdminRole } from '../lib/authStorage';
import { toast } from 'sonner';

/* ── types ── */
interface ApiKey {
  id: string; name: string; keyPrefix: string;
  environment: 'live' | 'test'; lastUsedAt: string | null; createdAt: string;
}
interface NewKeyResult extends ApiKey { rawKey: string; }

/* ── helpers ── */
const ago = (iso: string | null) => {
  if (!iso) return 'Never';
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

/* ── icons ── */
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);
const EyeIcon = ({ open }: { open: boolean }) => open
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const CopyIcon = ({ done }: { done: boolean }) => done
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);
const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const DocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);
const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.31.678.921.678 1.856 0 1.339-.012 2.419-.012 2.749 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
);

/* ── component ── */
export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEnv, setNewEnv] = useState<'live' | 'test'>('test');
  const [creating, setCreating] = useState(false);

  const [createdKey, setCreatedKey] = useState<NewKeyResult | null>(null);
  const [createdCopied, setCreatedCopied] = useState(false);

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = isAdminRole();

  useEffect(() => {
    fetchKeys();
    return () => { if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  async function fetchKeys() {
    try {
      setLoading(true);
      const data = await whapi.get<ApiKey[]>('/api-keys');
      setKeys(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Give the key a name');
      return;
    }
    try {
      setCreating(true);
      const result = await whapi.post<NewKeyResult>('/api-keys', {
        name: newName.trim(),
        environment: newEnv,
      });
      setKeys(prev => [result, ...prev]);
      setCreatedKey(result);
      setShowCreate(false);
      setNewName('');
      setNewEnv('test');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(key: ApiKey) {
    try {
      setRotatingId(key.id);
      const result = await whapi.post<NewKeyResult>(`/api-keys/${key.id}/rotate`, {});
      setKeys(prev => prev.map(k => (k.id === key.id ? result : k)));
      setCreatedKey(result);
      toast.success('Key rotated. The old key is now invalid.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rotate API key');
    } finally {
      setRotatingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await whapi.delete(`/api-keys/${deleteTarget.id}`);
      setKeys(prev => prev.filter(k => k.id !== deleteTarget.id));
      toast.success('API key revoked');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setDeleting(false);
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  async function copyCreatedKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.rawKey);
      setCreatedCopied(true);
      setTimeout(() => setCreatedCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  const maskedDisplay = (key: ApiKey) => {
    const isRevealed = revealedIds.has(key.id);
    const dots = '•'.repeat(24);
    return isRevealed ? `${key.keyPrefix}${dots}` : '•'.repeat(key.keyPrefix.length + 8);
  };

  return (
    <div className="dashboard-content">
      <div className="apikeys-header">
        <h1>API Access</h1>
        <p>Manage your API keys and integrate with OmniDimension</p>
      </div>

      {/* API Keys card */}
      <div className="apikeys-card">
        <div className="apikeys-card-head">
          <div className="apikeys-card-head-left">
            <div className="apikeys-icon"><KeyIcon /></div>
            <div>
              <h2>API Keys</h2>
              <p>Create and manage API keys for different integrations</p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => canManage ? setShowCreate(true) : toast.error('Only workspace admins can create API keys')}
            disabled={!canManage}
          >
            <PlusIcon /> Add New Key
          </button>
        </div>

        {loading ? (
          <div className="apikeys-loading">Loading keys…</div>
        ) : keys.length === 0 ? (
          <div className="apikeys-empty">No API keys yet. Create one to get started.</div>
        ) : (
          <div className="apikeys-table-wrap">
            <table className="apikeys-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>API Key</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key.id}>
                    <td className="apikeys-name">{key.name}</td>
                    <td>
                      <div className="apikeys-key-cell">
                        <code className="apikeys-key-code">{maskedDisplay(key)}</code>
                        <button
                          className="apikeys-icon-btn"
                          onClick={() => toggleReveal(key.id)}
                          title={revealedIds.has(key.id) ? 'Hide' : 'Show'}
                        >
                          <EyeIcon open={revealedIds.has(key.id)} />
                        </button>
                        <button
                          className="apikeys-icon-btn"
                          onClick={() => copyToClipboard(key.keyPrefix, key.id)}
                          title="Copy prefix"
                        >
                          <CopyIcon done={copiedId === key.id} />
                        </button>
                      </div>
                    </td>
                    <td>{ago(key.createdAt)}</td>
                    <td>
                      <div className="apikeys-row-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() => canManage ? handleRotate(key) : toast.error('Only workspace admins can rotate keys')}
                          disabled={!canManage || rotatingId === key.id}
                          title="Rotate key"
                        >
                          <RefreshIcon /> {rotatingId === key.id ? 'Rotating…' : 'Rotate'}
                        </button>
                        <button
                          className="apikeys-danger-btn"
                          onClick={() => canManage ? setDeleteTarget(key) : toast.error('Only workspace admins can revoke keys')}
                          disabled={!canManage}
                          title="Revoke key"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Documentation card */}
      <div className="apikeys-card">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          API Documentation
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Learn how to integrate with our API
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 14 }}>
          Our API allows you to programmatically create and manage voice AI agents, access call logs, and more.
        </p>
        <div className="apikeys-doc-links">
          <a href="/docs" className="btn btn-dark"><DocIcon /> Visit Docs</a>
          <a href="https://github.com/radhakrishna1210/Conversational_AI_Agent" target="_blank" rel="noopener noreferrer" className="btn btn-dark">
            <GithubIcon /> Visit SDK on Github
          </a>
        </div>
      </div>

      {/* Create key modal */}
      {showCreate && (
        <div className="apikeys-modal-overlay" onClick={() => !creating && setShowCreate(false)}>
          <div className="apikeys-modal" onClick={e => e.stopPropagation()}>
            <div className="apikeys-modal-head">
              <h3>Create new API key</h3>
              <button className="apikeys-icon-btn" onClick={() => setShowCreate(false)}><CloseIcon /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                autoFocus
                className="form-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Production Backend"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Environment</label>
              <div className="apikeys-env-toggle">
                {(['test', 'live'] as const).map(env => (
                  <button
                    key={env}
                    className={`apikeys-env-btn ${newEnv === env ? 'active' : ''}`}
                    onClick={() => setNewEnv(env)}
                  >
                    {env === 'live' ? 'Live' : 'Test'}
                  </button>
                ))}
              </div>
            </div>

            <div className="apikeys-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal-once new/rotated key modal */}
      {createdKey && (
        <div className="apikeys-modal-overlay">
          <div className="apikeys-modal" onClick={e => e.stopPropagation()}>
            <div className="apikeys-warning-box warn">
              <WarningIcon />
              <div>
                <h4>Save this key now</h4>
                <p>You won't be able to see this key again after closing this window.</p>
              </div>
            </div>

            <div className="apikeys-key-reveal">
              <code>{createdKey.rawKey}</code>
              <button className="apikeys-icon-btn" onClick={copyCreatedKey}>
                <CopyIcon done={createdCopied} />
              </button>
            </div>

            <div className="apikeys-modal-actions">
              <button className="btn btn-primary" onClick={() => setCreatedKey(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="apikeys-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="apikeys-modal" onClick={e => e.stopPropagation()}>
            <div className="apikeys-warning-box danger">
              <WarningIcon />
              <div>
                <h4>Revoke "{deleteTarget.name}"?</h4>
                <p>Any requests using this key will start failing immediately. This can't be undone.</p>
              </div>
            </div>

            <div className="apikeys-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="apikeys-danger-btn" onClick={handleDelete} disabled={deleting} style={{ padding: '9px 16px', fontSize: 13 }}>
                {deleting ? 'Revoking…' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}