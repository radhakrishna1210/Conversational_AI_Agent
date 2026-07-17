import { useEffect, useMemo, useState } from 'react';
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

  const botMap = useMemo(() => {
    return agents.reduce<Record<string, string>>((acc, agent) => {
      acc[agent.id] = agent.name;
      return acc;
    }, {});
  }, [agents]);

  useEffect(() => {
    setWorkspaceId(localStorage.getItem('workspaceId') ?? '');
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Not authenticated. Please sign in.');
          setLoading(false);
          return;
        }
        const [campaignsRes, agentsRes] = await Promise.all([
          whapi.get<BulkCampaign[]>('/campaigns'),
          // Use workspace-scoped API client so Authorization + workspaceId are sent
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

      // Debug: log the resolved URL and payload entries
      const ws = localStorage.getItem('workspaceId') ?? '';
      const debugUrl = `/api/v1/workspaces/${ws}/campaigns/bulk`;
      console.debug('Creating campaign ->', debugUrl);
      for (const pair of payload.entries()) {
        // For files, show file name
        if (pair[1] instanceof File) console.debug('FormData:', pair[0], (pair[1] as File).name, (pair[1] as File).size);
        else console.debug('FormData:', pair[0], pair[1]);
      }

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

  const handleDelete = async (campaignId: string) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await whapi.del(`/campaigns/${campaignId}`);
      setCampaigns((prev) => prev.filter((campaign) => campaign.id !== campaignId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  const handleStart = async (campaignId: string) => {
    try {
      await whapi.post(`/campaigns/${campaignId}/start`, {});
      await refreshCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start campaign');
    }
  };

  const hasCampaigns = campaigns.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Bulk Call Campaigns</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Create, monitor, and manage your bulk voice campaigns.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, color: 'white' }}>
            Total Concurrent Limit: 1
          </div>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setShowModal(true)}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Create New Campaign
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {hasCampaigns ? `${campaigns.length} campaigns found` : 'No campaigns present yet'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {loading ? 'Refreshing...' : 'Last updated'}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={refreshCampaigns} disabled={loading}>
            Refresh
          </button>
        </div>

        {hasCampaigns ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Bot</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>From Number</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Progress</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Concurrent Calls</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left' }}>Created Date</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top', color: 'var(--text-primary)' }}>{campaign.name}</td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>
                      <span style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '12px', background: 'rgba(14,179,158,0.12)', color: 'var(--text-secondary)' }}>
                        {campaign.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>{campaign.botId ? botMap[campaign.botId] ?? campaign.botId : '—'}</td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>{campaign.fromNumber || '—'}</td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top', width: '220px' }}>
                      <div style={{ height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${campaign.progress}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>{campaign.progress}%</div>
                    </td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>{campaign.concurrentCalls}</td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                        {(campaign.status === 'DRAFT' || campaign.status === 'FAILED') && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleStart(campaign.id)}>
                            Start
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(campaign.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '80px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.06)' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '32px' }}>
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>No bulk call campaigns found.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Try creating a new campaign to get started.</p>
          </div>
        )}
      </div>

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
