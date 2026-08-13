import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWorkspaceId, getToken } from '@/lib/authStorage';
import { whapi } from '../lib/whapi';

type BulkCampaign = {
  id: string;
  name: string;
  botId?: string | null;
  fromNumber?: string | null;
  fromNumbers?: string[] | null;
  clusterIds?: string[] | null;
  progress: number;
  concurrentCalls: number;
  status: string;
  createdAt: string;
  csvFileName?: string | null;
  callMode?: 'conversation' | 'greeting' | null;
  lastError?: string | null;
  sent?: number;
  failed?: number;
  totalContacts?: number;
};

type Agent = {
  id: string;
  name: string;
};

// A saved contact list. Campaigns dial these, not files — a CSV uploaded below
// is imported into one first, so it can be re-dialled next month without
// hunting for the spreadsheet.
type Cluster = {
  id: string;
  name: string;
  contactCount: number;
  dialableCount: number;
};

// What the chosen clusters actually add up to once overlapping lists are
// deduped and opt-outs are removed. Shown before launch, because "12,000 rows"
// and "9,140 people we may legally call" are different numbers.
type ClusterPreview = {
  clusters: number;
  rows: number;
  unique: number;
  duplicates: number;
  dialable: number;
  optedOut: number;
  invalid: number;
};

// `source` is open-ended: carriers routed through VoiceNumber report their own
// id ('plivo', 'exotel'), so a new carrier appears here without a client change.
type NumberOpt = { phoneNumber: string; label: string; source: 'twilio' | 'own' | string };

// What the selected agent's calls will actually be. A modular agent has no
// telephony bridge, so its phone calls play the welcome message and hang up —
// worth knowing before dialling a list, not after.
type CallModePreview = {
  mode: 'conversation' | 'greeting' | null;
  engine?: string;
  reason?: string;
  agentName?: string;
};

const CONCURRENT_LIMIT = 1;

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  RUNNING:   { bg: 'rgba(14,179,158,0.14)',  color: 'var(--cyan-fg)' },
  COMPLETED: { bg: 'rgba(34,197,94,0.14)',   color: 'var(--lime)' },
  DRAFT:     { bg: 'rgba(148,163,184,0.14)', color: 'var(--tx-2)' },
  PAUSED:    { bg: 'rgba(250,204,21,0.14)',  color: 'var(--warn)' },
  FAILED:    { bg: 'rgba(248,113,113,0.14)', color: 'var(--err)' },
  CANCELLED: { bg: 'rgba(251,146,60,0.14)',  color: 'var(--coral)' },
};

// Statuses the Start button applies to. PAUSED resumes from where it stopped.
const STARTABLE = new Set(['DRAFT', 'SCHEDULED', 'PAUSED', 'FAILED']);

// Mirrors .rz-table's th/td. Kept as objects because this table is built from
// <th style=...> rather than a class-driven <table className="rz-table">, and
// converting the whole grid would touch every cell for no visual gain.
const thStyle: React.CSSProperties = {
  padding: '11px 16px',
  textAlign: 'left',
  fontFamily: 'var(--ff-m)',
  fontSize: '10.5px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: 'var(--tx-3)',
  background: 'var(--bg-2)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '13px 16px',
  fontSize: '13px',
  color: 'var(--tx-2)',
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

  // Where this campaign's numbers come from. Both paths end at a cluster; the
  // CSV path just creates one on the way through.
  const [listSource, setListSource] = useState<'clusters' | 'csv'>('clusters');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [preview, setPreview] = useState<ClusterPreview | null>(null);
  const [clusterName, setClusterName] = useState('');

  // Caller IDs to rotate across the campaign's calls.
  const [callerNumbers, setCallerNumbers] = useState<NumberOpt[]>([]);
  const [callerError, setCallerError] = useState<string | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<string[]>([]);
  const [modePreview, setModePreview] = useState<CallModePreview | null>(null);
  const [ackGreetingOnly, setAckGreetingOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const clusterMap = useMemo(() => {
    return clusters.reduce<Record<string, string>>((acc, cluster) => {
      acc[cluster.id] = cluster.name;
      return acc;
    }, {});
  }, [clusters]);

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
        const [campaignsRes, agentsRes, clustersRes] = await Promise.all([
          whapi.get<BulkCampaign[]>('/campaigns'),
          whapi.get<Agent[]>('/agents'),
          // Loaded up front, not just for the modal: the table names the list
          // each campaign is dialling.
          whapi.get<Cluster[]>('/clusters').catch(() => [] as Cluster[]),
        ]);

        setCampaigns(campaignsRes ?? []);
        setAgents(Array.isArray(agentsRes) ? agentsRes : []);
        setClusters(Array.isArray(clustersRes) ? clustersRes : []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [workspaceId]);

  const refreshCampaigns = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await whapi.get<BulkCampaign[]>('/campaigns');
      setCampaigns(data);
      if (!quiet) setError(null);
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : 'Failed to refresh campaigns');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // A running campaign dials over minutes or hours, so the table has to move on
  // its own — otherwise progress looks frozen and people press Start again.
  const hasRunning = campaigns.some((c) => c.status === 'RUNNING');
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => refreshCampaigns(true), 5000);
    return () => clearInterval(id);
  }, [hasRunning]);

  // Caller numbers come from Twilio (owned + verified), the same source the
  // single-call picker uses.
  useEffect(() => {
    if (!showModal) return;
    whapi.get<{ owned: NumberOpt[]; verified: NumberOpt[] }>('/caller-numbers')
      .then((r) => {
        setCallerNumbers([...(r.owned ?? []), ...(r.verified ?? [])]);
        setCallerError(null);
      })
      .catch((e) => setCallerError(e instanceof Error ? e.message : 'Failed to load numbers'));

    // Counts move as contacts are imported or opted out elsewhere, so re-read
    // them each time the modal opens rather than trusting the page load.
    whapi.get<Cluster[]>('/clusters')
      .then((r) => setClusters(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, [showModal]);

  // What the selection adds up to, deduped across clusters and with opt-outs
  // removed. Asked of the server because only it knows the overlap.
  useEffect(() => {
    if (!selectedClusters.length) { setPreview(null); return; }
    const params = new URLSearchParams({ clusterIds: JSON.stringify(selectedClusters) });
    let cancelled = false;
    whapi.get<ClusterPreview>(`/clusters/preview?${params.toString()}`)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [selectedClusters]);

  // Ask the backend what the chosen agent can actually do on a phone call.
  useEffect(() => {
    if (!form.botId) { setModePreview(null); return; }
    setAckGreetingOnly(false);
    whapi.get<CallModePreview>(`/campaigns/call-mode?agentId=${encodeURIComponent(form.botId)}`)
      .then(setModePreview)
      .catch(() => setModePreview(null));
  }, [form.botId]);

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

  const toggleFrom = (num: string) => {
    setSelectedFrom((prev) => (prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]));
  };

  const greetingOnly = modePreview?.mode === 'greeting';
  const needsAck = greetingOnly && !ackGreetingOnly;

  const toggleCluster = (id: string) => {
    setSelectedClusters((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleCreateCampaign = async () => {
    if (!form.campaignName.trim()) {
      setError('Campaign name is required');
      return;
    }
    if (!form.botId) {
      setError('Select a voice agent — the campaign needs one to place calls');
      return;
    }
    if (listSource === 'clusters' && !selectedClusters.length) {
      setError('Pick at least one contact cluster to dial');
      return;
    }
    if (listSource === 'clusters' && preview && preview.dialable === 0) {
      setError('Those clusters have no dialable contacts — everyone on them has opted out or has an invalid number');
      return;
    }
    if (listSource === 'csv' && !form.file) {
      setError('Choose a CSV file, or switch to picking a saved cluster');
      return;
    }
    if (needsAck) {
      setError('Tick the box to confirm you understand these will be greeting-only calls');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = new FormData();
      payload.append('campaignName', form.campaignName.trim());
      payload.append('botId', form.botId);
      payload.append('concurrentCalls', String(form.concurrentCalls));
      payload.append('fromNumbers', JSON.stringify(selectedFrom));
      if (listSource === 'csv' && form.file) {
        payload.append('file', form.file);
        // The uploaded file becomes a saved cluster under this name, so the
        // list outlives the campaign.
        payload.append('clusterName', clusterName.trim() || form.campaignName.trim());
      } else {
        payload.append('clusterIds', JSON.stringify(selectedClusters));
      }

      await whapi.postForm<BulkCampaign>('/campaigns/bulk', payload);
      setShowModal(false);
      setForm({ campaignName: '', botId: '', concurrentCalls: 1, file: null });
      setSelectedFrom([]);
      setSelectedClusters([]);
      setClusterName('');
      setPreview(null);
      setListSource('clusters');
      setModePreview(null);
      setAckGreetingOnly(false);
      await refreshCampaigns();
      await whapi.get<Cluster[]>('/clusters').then((r) => setClusters(Array.isArray(r) ? r : [])).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create campaign');
    } finally {
      setSaving(false);
    }
  };

  const selectedCampaigns = campaigns.filter((c) => selected.has(c.id));
  const startable = selectedCampaigns.filter((c) => STARTABLE.has(c.status));
  const pausable = selectedCampaigns.filter((c) => c.status === 'RUNNING');

  // Start/Pause/Cancel act per campaign so one failure (e.g. no balance) reports
  // itself instead of being swallowed by Promise.all rejecting on the first.
  const runAction = async (targets: BulkCampaign[], action: 'start' | 'pause' | 'cancel' | 'sync-list') => {
    setError(null);
    const failures: string[] = [];
    for (const c of targets) {
      setBusyId(c.id);
      try {
        await whapi.post(`/campaigns/${c.id}/${action}`, {});
      } catch (err) {
        failures.push(`${c.name}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    setBusyId(null);
    setSelected(new Set());
    await refreshCampaigns();
    if (failures.length) setError(failures.join(' · '));
  };

  const handleStartSelected = () => runAction(startable, 'start');
  const handlePauseSelected = () => runAction(pausable, 'pause');

  // A campaign's recipients are a snapshot taken at creation. Contacts added to
  // its clusters afterwards are not dialled unless they are pulled in — made an
  // explicit action rather than a silent one, so a running list never grows
  // under someone's feet.
  const syncable = selectedCampaigns.filter(
    (c) => STARTABLE.has(c.status) && (c.clusterIds?.length ?? 0) > 0,
  );
  const handleSyncSelected = () => runAction(syncable, 'sync-list');

  const handleCancelSelected = async () => {
    const running = selectedCampaigns.filter((c) => c.status === 'RUNNING' || c.status === 'PAUSED');
    if (!running.length) return;
    if (!window.confirm(
      `Cancel ${running.length} campaign(s)? Calls already placed cannot be recalled, and the `
      + 'remaining numbers will be skipped permanently.',
    )) return;
    await runAction(running, 'cancel');
  };

  const handleDeleteSelected = async () => {
    if (selectedCampaigns.some((c) => c.status === 'RUNNING')) {
      setError('Pause or cancel a running campaign before deleting it');
      return;
    }
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
    padding: '10px 36px 10px 12px',
    borderRadius: '10px',
    border: '1px solid var(--line-2)',
    background: 'var(--s2)',
    color: 'var(--tx)',
    fontSize: '13.5px',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a97ab' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
  };

  return (
    <div className="rz-page rz-page-pad rz-bleed">
     <div className="rz-wrap-wide">
      {/* Header */}
      <div className="rz-head">
        <div>
          <div className="rz-eyebrow">Operate</div>
          <h1 className="rz-h1">Bulk call campaigns</h1>
          <p className="rz-sub" style={{ margin: '8px 0 0' }}>
            Dial a contact list with one of your agents, and watch it work through the queue.
          </p>
        </div>
        <div className="rz-head-actions">
          <span
            className="rz-tag"
            title="Maximum number of calls that can run at the same time on this workspace."
          >
            {CONCURRENT_LIMIT} concurrent {CONCURRENT_LIMIT === 1 ? 'call' : 'calls'}
          </span>
          <button className="rz-btn rz-btn-primary" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            New campaign
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '18px' }}>
        <div className="rz-label" style={{ marginBottom: '10px' }}>Filter by</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '250px' }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--tx-3)"
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
              placeholder="Search by name or phone…"
              className="rz-input"
              style={{ paddingLeft: '38px' }}
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
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Bulk action bar — appears only when rows are selected */}
      {selected.size > 0 && (
        <div className="rz-enter" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--line-2)', background: 'var(--s2)' }}>
          <span className="rz-mono">{selected.size} selected</span>
          {startable.length > 0 && (
            <button className="rz-btn rz-btn-primary rz-btn-sm" onClick={handleStartSelected} disabled={Boolean(busyId)}>
              {busyId ? 'Starting…' : startable.some((c) => c.status === 'PAUSED') ? 'Resume' : 'Start'}
            </button>
          )}
          {pausable.length > 0 && (
            <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={handlePauseSelected} disabled={Boolean(busyId)}>
              Pause
            </button>
          )}
          {syncable.length > 0 && (
            <button
              className="rz-btn rz-btn-secondary rz-btn-sm"
              onClick={handleSyncSelected}
              disabled={Boolean(busyId)}
              title="Add contacts that joined this campaign's clusters since it was created. Numbers already dialled are never repeated."
            >
              Sync list
            </button>
          )}
          {selectedCampaigns.some((c) => c.status === 'RUNNING' || c.status === 'PAUSED') && (
            <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={handleCancelSelected} disabled={Boolean(busyId)}>
              Cancel
            </button>
          )}
          <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={handleDeleteSelected}>
            Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden', background: 'var(--s1)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ ...thStyle, width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all campaigns"
                    style={{ width: '16px', height: '16px', accentColor: 'var(--cyan)', cursor: 'pointer' }}
                  />
                </th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>List</th>
                <th style={thStyle}>Bot</th>
                <th style={thStyle}>From Number</th>
                <th style={thStyle}>Progress</th>
                <th style={thStyle}>Calls</th>
                <th style={thStyle}>Concurrent Calls</th>
                <th style={thStyle}>Created Date</th>
              </tr>
            </thead>
            <tbody>
              {hasRows ? (
                filtered.map((campaign) => {
                  const pill = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.DRAFT;
                  return (
                    <tr key={campaign.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={selected.has(campaign.id)}
                          onChange={() => toggleOne(campaign.id)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--cyan)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {campaign.name}
                        {campaign.callMode === 'greeting' && (
                          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--warn)', marginTop: '3px' }}>
                            greeting-only
                          </div>
                        )}
                        {campaign.lastError && (
                          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--err)', marginTop: '3px', maxWidth: '260px' }}>
                            {campaign.lastError}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: pill.bg, color: pill.color }}>
                          {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const ids = Array.isArray(campaign.clusterIds) ? campaign.clusterIds : [];
                          // A deleted cluster leaves its id behind; the campaign
                          // still has its own frozen recipient list, so fall
                          // back to the CSV name rather than showing nothing.
                          const names = ids.map((id) => clusterMap[id]).filter(Boolean);
                          if (names.length) {
                            return (
                              <Link to="/contacts" style={{ color: 'var(--cyan-fg)' }}>
                                {names[0]}{names.length > 1 ? ` +${names.length - 1}` : ''}
                              </Link>
                            );
                          }
                          return campaign.csvFileName || '—';
                        })()}
                      </td>
                      <td style={tdStyle}>{campaign.botId ? botMap[campaign.botId] ?? campaign.botId : '—'}</td>
                      <td style={tdStyle}>
                        {(campaign.fromNumbers?.length ?? 0) > 1
                          ? `${campaign.fromNumbers![0]} +${campaign.fromNumbers!.length - 1} more`
                          : campaign.fromNumber || '—'}
                      </td>
                      <td style={{ ...tdStyle, minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ flex: 1, height: '8px', borderRadius: '999px', background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
                            <div style={{ width: `${campaign.progress}%`, height: '100%', background: 'var(--cyan)', transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--tx-2)', minWidth: '34px' }}>{campaign.progress}%</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--lime)' }}>{campaign.sent ?? 0}</span>
                        {' / '}
                        <span style={{ color: (campaign.failed ?? 0) > 0 ? 'var(--err)' : 'var(--tx-2)' }}>
                          {campaign.failed ?? 0}
                        </span>
                        <span style={{ color: 'var(--tx-2)' }}> of {campaign.totalContacts ?? 0}</span>
                      </td>
                      <td style={tdStyle}>{campaign.concurrentCalls}</td>
                      <td style={tdStyle}>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ padding: '56px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--tx-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                      </svg>
                      <p style={{ color: 'var(--tx)', fontSize: '14px', margin: 0 }}>
                        {loading ? 'Loading campaigns...' : 'No bulk call campaigns found.'}
                      </p>
                      {!loading && (
                        <p style={{ color: 'var(--tx-2)', fontSize: '13px', margin: 0 }}>
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
          <div style={{ width: '100%', maxWidth: '560px', background: 'var(--s1)', borderRadius: '20px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Create New Bulk Call Campaign</h2>
                <p style={{ margin: '8px 0 0', color: 'var(--tx-2)', fontSize: '13px' }}>Pick a saved contact cluster (or upload a CSV, which becomes one), choose a voice agent, and configure concurrent calls.</p>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: '24px' }} onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <label style={{ display: 'grid', gap: '8px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Campaign Name
                <input
                  value={form.campaignName}
                  onChange={(event) => handleCreateChange('campaignName', event.target.value)}
                  placeholder="Enter campaign name"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', background: 'var(--s2)', color: 'var(--tx)' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '8px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Select Voice Agent
                <select
                  value={form.botId}
                  onChange={(event) => handleCreateChange('botId', event.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', background: 'var(--s2)', color: 'var(--tx)' }}
                >
                  <option value="">Choose an agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </label>

              {/* What the calls will actually be. Shown as soon as an agent is
                  picked, because a modular agent cannot hold a phone conversation. */}
              {modePreview?.mode && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  lineHeight: 1.55,
                  background: greetingOnly ? 'rgba(250,204,21,0.10)' : 'rgba(34,197,94,0.10)',
                  border: `1px solid ${greetingOnly ? 'rgba(250,204,21,0.35)' : 'rgba(34,197,94,0.35)'}`,
                  color: 'var(--tx)',
                }}>
                  <strong>{greetingOnly ? '⚠️ Greeting-only broadcast' : '✅ Two-way conversation'}</strong>
                  <div style={{ color: 'var(--tx-2)', marginTop: '5px' }}>
                    {greetingOnly
                      ? modePreview.reason
                      : 'Each recipient will have a live back-and-forth conversation with this agent.'}
                  </div>
                  {greetingOnly && (
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={ackGreetingOnly}
                        onChange={(e) => setAckGreetingOnly(e.target.checked)}
                        style={{ marginTop: '2px', accentColor: 'var(--cyan)' }}
                      />
                      <span style={{ color: 'var(--tx)' }}>
                        I understand every recipient will hear a recorded message, not a conversation.
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Caller IDs. Rotating across several numbers spreads outbound
                  volume, which is what keeps carriers from flagging the campaign. */}
              <div style={{ display: 'grid', gap: '8px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Call from {selectedFrom.length > 1 && (
                  <span style={{ color: 'var(--cyan-fg)' }}>
                    — rotating across {selectedFrom.length} numbers
                  </span>
                )}
                {callerError && <div style={{ color: 'var(--err)', fontSize: '12px' }}>{callerError}</div>}
                {!callerError && callerNumbers.length === 0 && (
                  <div style={{ fontSize: '12px' }}>Loading your numbers…</div>
                )}
                {callerNumbers.length > 0 && (
                  <div style={{
                    maxHeight: '132px',
                    overflowY: 'auto',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '8px',
                    background: 'var(--s2)',
                  }}>
                    {callerNumbers.map((n) => (
                      <label key={n.phoneNumber} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedFrom.includes(n.phoneNumber)}
                          onChange={() => toggleFrom(n.phoneNumber)}
                          style={{ accentColor: 'var(--cyan)' }}
                        />
                        <span style={{ color: 'var(--tx)', fontSize: '13px' }}>
                          {n.phoneNumber}
                          <span style={{ color: 'var(--tx-2)' }}>
                            {' '}— {n.label} {n.source === 'own'
                              ? '(your number ✓)'
                              : n.source === 'twilio' ? '(platform)' : `(${n.source})`}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '11.5px', color: 'var(--tx-3)' }}>
                  {selectedFrom.length === 0
                    ? 'None selected — the platform default number will be used for every call.'
                    : 'Calls are spread evenly across the selected numbers.'}
                </div>
              </div>

              {/* Who to call. A saved cluster is the normal path; a CSV is the
                  first-time path, and it becomes a cluster on the way in so the
                  second campaign never needs the file again. */}
              <div style={{ display: 'grid', gap: '10px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Who to call
                <div className="rz-tabs" style={{ alignSelf: 'flex-start' }}>
                  <button
                    type="button"
                    className={`rz-tab ${listSource === 'clusters' ? 'is-active' : ''}`}
                    onClick={() => setListSource('clusters')}
                  >
                    Saved clusters
                  </button>
                  <button
                    type="button"
                    className={`rz-tab ${listSource === 'csv' ? 'is-active' : ''}`}
                    onClick={() => setListSource('csv')}
                  >
                    Upload a CSV
                  </button>
                </div>

                {listSource === 'clusters' ? (
                  <>
                    {clusters.length === 0 ? (
                      <div style={{ fontSize: '12.5px', lineHeight: 1.6 }}>
                        No clusters yet.{' '}
                        <Link to="/contacts" style={{ color: 'var(--cyan-fg)' }}>Build one in Call Contacts</Link>
                        {' '}— or upload a CSV here and it will become your first.
                      </div>
                    ) : (
                      <div style={{
                        maxHeight: '150px',
                        overflowY: 'auto',
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '8px',
                        background: 'var(--s2)',
                      }}>
                        {clusters.map((c) => (
                          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 4px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedClusters.includes(c.id)}
                              onChange={() => toggleCluster(c.id)}
                              style={{ accentColor: 'var(--cyan)' }}
                            />
                            <span style={{ color: 'var(--tx)', fontSize: '13px' }}>
                              {c.name}
                              <span style={{ color: 'var(--tx-2)' }}>
                                {' '}— {c.dialableCount.toLocaleString()} dialable
                                {c.contactCount !== c.dialableCount && ` of ${c.contactCount.toLocaleString()}`}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {preview && (
                      <div style={{
                        padding: '11px 13px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        lineHeight: 1.6,
                        background: 'var(--s2)',
                        border: '1px solid var(--line-2)',
                      }}>
                        <strong style={{ color: 'var(--tx)' }}>
                          {preview.dialable.toLocaleString()} {preview.dialable === 1 ? 'person' : 'people'} will be called
                        </strong>
                        <div style={{ color: 'var(--tx-3)', marginTop: '4px' }}>
                          {preview.unique.toLocaleString()} unique across {preview.clusters} cluster{preview.clusters === 1 ? '' : 's'}
                          {preview.duplicates > 0 && ` · ${preview.duplicates.toLocaleString()} overlap removed`}
                          {preview.optedOut > 0 && ` · ${preview.optedOut.toLocaleString()} opted out`}
                          {preview.invalid > 0 && ` · ${preview.invalid.toLocaleString()} invalid`}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => handleCreateChange('file', event.target.files?.[0] ?? null)}
                      style={{ width: '100%', color: 'var(--tx)' }}
                    />
                    <label style={{ display: 'grid', gap: '6px' }}>
                      Save this list as
                      <input
                        value={clusterName}
                        onChange={(event) => setClusterName(event.target.value)}
                        placeholder={form.campaignName.trim() || 'Cluster name'}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', background: 'var(--s2)', color: 'var(--tx)' }}
                      />
                      <span style={{ fontSize: '11.5px', color: 'var(--tx-3)' }}>
                        The upload is saved as a cluster you can rename, top up and re-dial later.
                        Numbers already in your contacts are updated, not duplicated.
                      </span>
                    </label>
                  </>
                )}
              </div>

              <label style={{ display: 'grid', gap: '8px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Concurrent Calls
                <input
                  type="number"
                  min={1}
                  value={form.concurrentCalls}
                  onChange={(event) => handleCreateChange('concurrentCalls', Number(event.target.value))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', background: 'var(--s2)', color: 'var(--tx)' }}
                />
              </label>

              {error && <div style={{ color: 'var(--err)', fontSize: '13px' }}>{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)} type="button">Cancel</button>
                <button className="btn btn-primary" onClick={handleCreateCampaign} type="button" disabled={saving || needsAck}>
                  {saving ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
     </div>
    </div>
  );
}
