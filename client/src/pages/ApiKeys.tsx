import { Fragment, useEffect, useState } from 'react';
import { whapi } from '../lib/whapi';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  createdAt: string;
  rawKey?: string;
}

export default function ApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [keyCache, setKeyCache] = useState<Record<string, string>>({}); // Store rawKey for show/hide
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    setError('');
    try {
      const keys = await whapi.get<ApiKey[]>('/api-keys');
      setApiKeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    } catch (err) {
      alert('Failed to copy API key');
    }
  };

  const deleteApiKey = async (id: string) => {
    if (!window.confirm('Delete this API key? This cannot be undone.')) return;
    setDeletingKey(id);
    setError('');

    try {
      await whapi.del(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((key) => key.id !== id));
      setShowKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    } finally {
      setDeletingKey(null);
    }
  };

  const createApiKey = async () => {
    setCreating(true);
    setError('');
    try {
      const created = await whapi.post<ApiKey>('/api-keys', {
        name: newKeyName || 'OmniDimension API Key',
        environment: 'live',
      });

      setApiKeys((prev) => [created, ...prev]);
      setNewKeyName('');

      if (created.rawKey) {
        setKeyCache((prev) => ({ ...prev, [created.id]: created.rawKey! }));
        setShowKeys((prev) => ({ ...prev, [created.id]: true }));
        alert(`New API key created:\n${created.rawKey}\n\nCopy it now — it won't be shown again.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create API key');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString();

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>API Access</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Manage your API keys and integrate with OmniDimension
        </p>
      </div>

      {/* API Keys Card */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.02)',
        padding: '24px 32px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: 'white' }}>
              <span style={{ color: 'var(--teal)' }}>🔑</span> API Keys
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              Create and manage API keys for different integrations
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (optional)"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                minWidth: '220px',
                fontSize: '13px',
              }}
            />
            <button
              onClick={createApiKey}
              disabled={creating}
              style={{
                background: 'var(--teal)',
                color: 'var(--bg-primary)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: creating ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
              {creating ? 'Creating...' : 'Add New Key'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ color: '#f87171', marginBottom: '16px', fontSize: '13px' }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading API keys...</div>
        ) : apiKeys.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No API keys yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.3fr) minmax(340px, 2fr) minmax(120px, 1fr) 100px minmax(160px, 1fr)', gap: '16px', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>Name</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>API Key</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px' }}>Created</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px', textAlign: 'center' }}>Environment</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, paddingBottom: '16px', textAlign: 'right' }}>Actions</div>

            {apiKeys.map((key) => (
              <Fragment key={key.id}>
                <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{key.name}</div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    value={showKeys[key.id] && keyCache[key.id] ? keyCache[key.id] : '••••••••••••••••••••••••'}
                    readOnly
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      color: 'white',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => setShowKeys((prev) => ({ ...prev, [key.id]: !prev[key.id] }))}
                    style={{
                      background: 'rgba(45, 212, 191, 0.12)',
                      border: '1px solid var(--border)',
                      color: 'var(--teal)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {showKeys[key.id] ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{formatDate(key.createdAt)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>{key.environment}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {keyCache[key.id] && (
                    <button
                      onClick={() => copyToClipboard(keyCache[key.id])}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--border)',
                        color: 'white',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      Copy
                    </button>
                  )}
                  <button
                    onClick={() => deleteApiKey(key.id)}
                    disabled={deletingKey === key.id}
                    style={{
                      background: deletingKey === key.id ? 'rgba(248, 113, 113, 0.16)' : 'rgba(248, 113, 113, 0.12)',
                      border: '1px solid rgba(248, 113, 113, 0.7)',
                      color: '#b91c1c',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: deletingKey === key.id ? 'wait' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {deletingKey === key.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* API Documentation Card */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.02)',
        padding: '32px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'white' }}>
          API Documentation
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px 0' }}>
          Learn how to integrate with our API
        </p>

        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          Our API allows you to programmatically create and manage voice AI agents, access call logs, and more.
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            Visit Docs
          </button>
          <button style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            Visit SDK on Github
          </button>
        </div>
      </div>
    </>
  );
}
