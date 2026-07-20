import { useEffect, useMemo, useState } from 'react';
import { getWorkspaceId, getToken } from '@/lib/authStorage';
import { whapi } from '../lib/whapi';

type BulkCampaign = {
  id: string;
  name: string;
  botId?: string | null;
  fromNumber?: string | null;
  progress: number;
  concurrentCalls: number;
  status: string;
  createdAt: string;
  csvFileName?: string | null;
};

type Agent = {
  id: string;
  name: string;
};

const CONCURRENT_LIMIT = 1;

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  RUNNING:   { bg: 'rgba(14,179,158,0.14)',  color: 'var(--teal)' },
  COMPLETED: { bg: 'rgba(34,197,94,0.14)',   color: '#22c55e' },
  DRAFT:     { bg: 'rgba(148,163,184,0.14)', color: 'var(--text-secondary)' },
  FAILED:    { bg: 'rgba(248,113,113,0.14)', color: '#f87171' },
  CANCELLED: { bg: 'rgba(251,146,60,0.14)',  color: '#fb923c' },
};

const thStyle: React.CSSProperties = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '14px',
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
};

export default function BulkCall() {
  const [campaigns, setCampaigns] = useState<BulkCampaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [form, setForm] = useState({
    campaignName: '',
    botId: '',
    concurrentCalls: 1,
    file: null as File | null,
  });

  // Filters (match the reference UI: search + status + bot)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [botFilter, setBotFilter] = useState('');

  // Row selection via the checkbox column
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const botMap = useMemo(() => {
    return agents.reduce<Record<string, string>>((acc, agent) => {
      acc[agent.id] = agent.name;
      return acc;
    }, {});
  }, [agents]);

  useEffect(() => {
    // Shared recovery: reads local/session storage and falls back to decoding
    // the JWT, so the page loads even when localStorage was cleared or blocked.
    const wsId = getWorkspaceId();
    setWorkspaceId(wsId);
    if (!wsId) {
      setError('Your session is missing workspace context. Please sign in again.');
    }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const load = async () => {
      setLoading(true);
      try {
        const token = getToken();
        if (!token) {
          setError('Not authenticated. Please sign in.');
          setLoading(false);
          return;
        }
        const [campaignsRes, agentsRes] = await Promise.all([
          whapi.get<BulkCampaign[]>('/campaigns'),
          whapi.get<Agent[]>('/agents'),
        ]);

        setCampaigns(campaignsRes ?? []);
        setAgents(Array.isArray(agentsRes) ? agentsRes : []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [workspaceId]);

  const refreshCampaigns = async () => {
    setLoading(true);
    try {
      const data = await whapi.get<BulkCampaign[]>('/campaigns');
      setCampaigns(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh campaigns');
    } finally {
      setLoading(false);
    }
  };

  const statuses = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.status))).sort(),
    [campaigns],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.fromNumber ?? '').toLowerCase().includes(q)) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (botFilter && c.botId !== botFilter) return false;
      return true;
    });
  }, [campaigns, search, statusFilter, botFilter]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateChange = (field: keyof typeof form, value: string | number | File | null) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateCampaign = async () => {
    if (!form.campaignName.trim()) {
      setError('Campaign name is required');
      return;
    }

    if (!form.file) {
      setError('CSV file is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = new FormData();
      payload.append('campaignName', form.campaignName.trim());
      payload.append('botId', form.botId);
      payload.append('concurrentCalls', String(form.concurrentCalls));
      payload.append('file', form.file);

      await whapi.postForm<BulkCampaign>('/campaigns/bulk', payload);
      setShowModal(false);
      setForm({ campaignName: '', botId: '', concurrentCalls: 1, file: null });
      await refreshCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create campaign');
    } finally {
      setSaving(false);
    }
  };

  const selectedCampaigns = campaigns.filter((c) => selected.has(c.id));
  const startable = selectedCampaigns.filter((c) => c.status === 'DRAFT' || c.status === 'FAILED');

  const handleStartSelected = async () => {
    try {
      await Promise.all(startable.map((c) => whapi.post(`/campaigns/${c.id}/start`, {})));
      setSelected(new Set());
      await refreshCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start campaign');
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`Delete ${selectedCampaigns.length} campaign(s)?`)) return;
    try {
      await Promise.all(selectedCampaigns.map((c) => whapi.del(`/campaigns/${c.id}`)));
      setCampaigns((prev) => prev.filter((c) => !selected.has(c.id)));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  const hasRows = filtered.length > 0;

  const selectStyle: React.CSSProperties = {
    padding: '10px 36px 10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a97ab' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '36px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px', color: 'var(--text-primary)' }}>Bulk Call Campaigns</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Manage and monitor your bulk call campaigns.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{CONCURRENT_LIMIT}</strong>
            <span>concurrent {CONCURRENT_LIMIT === 1 ? 'call' : 'calls'}</span>
            <span
              title="Maximum number of calls that can run at the same time on your plan."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                border: '1px solid var(--text-secondary)',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'help',
                userSelect: 'none',
              }}
            >
              i
            </span>
          </div>
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', borderRadius: '8px', fontWeight: 600 }}
            onClick={() => setShowModal(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Create New Campaign
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Filter by</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '250px' }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...selectStyle, minWidth: '180px' }}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select value={botFilter} onChange={(e) => setBotFilter(e.target.value)} style={{ ...selectStyle, minWidth: '180px' }}>
            <option value="">All bots</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--error)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Bulk action bar — appears only when rows are selected */}
      {selected.size > 0 && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{selected.size} selected</span>
          {startable.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={handleStartSelected}>
              Start
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleDeleteSelected}>
            Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                  />
                </th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Bot</th>
                <th style={thStyle}>From Number</th>
                <th style={thStyle}>Progress</th>
                <th style={thStyle}>Concurrent Calls</th>
                <th style={thStyle}>Created Date</th>
              </tr>
            </thead>
            <tbody>
              {hasRows ? (
                filtered.map((campaign) => {
                  const pill = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.DRAFT;
                  return (
                    <tr key={campaign.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={selected.has(campaign.id)}
                          onChange={() => toggleOne(campaign.id)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{campaign.name}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: pill.bg, color: pill.color }}>
                          {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>{campaign.botId ? botMap[campaign.botId] ?? campaign.botId : '—'}</td>
                      <td style={tdStyle}>{campaign.fromNumber || '—'}</td>
                      <td style={{ ...tdStyle, minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, height: '8px', borderRadius: '999px', background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
                            <div style={{ width: `${campaign.progress}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '34px' }}>{campaign.progress}%</span>
                        </div>
                      </td>
                      <td style={tdStyle}>{campaign.concurrentCalls}</td>
                      <td style={tdStyle}>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '56px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                      </svg>
                      <p style={{ color: 'var(--text-primary)', fontSize: '14px', margin: 0 }}>
                        {loading ? 'Loading campaigns...' : 'No bulk call campaigns found.'}
                      </p>
                      {!loading && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                          {campaigns.length > 0 ? 'Try adjusting your filters.' : 'Try creating a new campaign to get started.'}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create campaign modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '560px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Create New Bulk Call Campaign</h2>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Upload a CSV, choose a voice agent, and configure concurrent calls.</p>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '24px' }} onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <label style={{ display: 'grid', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Campaign Name
                <input
                  value={form.campaignName}
                  onChange={(event) => handleCreateChange('campaignName', event.target.value)}
                  placeholder="Enter campaign name"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Select Voice Agent
                <select
                  value={form.botId}
                  onChange={(event) => handleCreateChange('botId', event.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                >
                  <option value="">Choose an agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Upload CSV File
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleCreateChange('file', event.target.files?.[0] ?? null)}
                  style={{ width: '100%', color: 'var(--text-primary)' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Concurrent Calls
                <input
                  type="number"
                  min={1}
                  value={form.concurrentCalls}
                  onChange={(event) => handleCreateChange('concurrentCalls', Number(event.target.value))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                />
              </label>

              {error && <div style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)} type="button">Cancel</button>
                <button className="btn btn-primary" onClick={handleCreateCampaign} type="button" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
