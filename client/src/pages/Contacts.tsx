import { useCallback, useEffect, useMemo, useState } from 'react';
import { whapi, getAuth } from '../lib/whapi';

/**
 * Call contacts — the address book behind bulk calling.
 *
 * Two views of the same data. "Clusters" is the one that matters at launch time:
 * a campaign dials a cluster, never a file. "All contacts" is where a person is
 * found, corrected, or opted out — and an opt-out here removes them from every
 * future campaign built from any list they happen to be on.
 */

type Cluster = {
  id: string;
  name: string;
  description?: string | null;
  source: 'MANUAL' | 'CSV_IMPORT' | 'CAMPAIGN_CSV' | string;
  csvFileName?: string | null;
  contactCount: number;
  dialableCount: number;
  createdAt: string;
};

type Contact = {
  id: string;
  phoneNumber: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  status: 'ACTIVE' | 'OPTED_OUT' | 'INVALID' | string;
  notes?: string | null;
  callCount: number;
  lastCalledAt?: string | null;
  createdAt: string;
  clusters: { id: string; name: string }[];
};

type ContactPage = { rows: Contact[]; total: number; page: number; pageSize: number };

type Summary = { total: number; active: number; optedOut: number; invalid: number; clusters: number };

type ImportSummary = {
  rows: number;
  parsed: number;
  created: number;
  updated: number;
  invalid: number;
  duplicatesInFile: number;
  addedToCluster: number;
  clusterTotal: number;
  invalidSamples: string[];
};

const PAGE_SIZE = 50;

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Built by hand',
  CSV_IMPORT: 'CSV import',
  CAMPAIGN_CSV: 'From a campaign',
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'rz-pill rz-pill-ok',
  OPTED_OUT: 'rz-pill rz-pill-warn',
  INVALID: 'rz-pill rz-pill-err',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  OPTED_OUT: 'Opted out',
  INVALID: 'Invalid',
};

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function Contacts() {
  const [tab, setTab] = useState<'clusters' | 'contacts'>('clusters');

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState<ContactPage>({ rows: [], total: 0, page: 1, pageSize: PAGE_SIZE });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Contact filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [pageNo, setPageNo] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [importOpen, setImportOpen] = useState(false);
  const [newClusterOpen, setNewClusterOpen] = useState(false);
  const [renaming, setRenaming] = useState<Cluster | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addToClusterOpen, setAddToClusterOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ cluster: Cluster; summary: ImportSummary } | null>(null);

  const loadClusters = useCallback(async () => {
    const [list, sum] = await Promise.all([
      whapi.get<Cluster[]>('/clusters'),
      whapi.get<Summary>('/contacts/summary'),
    ]);
    setClusters(list ?? []);
    setSummary(sum);
  }, []);

  const loadContacts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pageNo), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (clusterFilter) params.set('clusterId', clusterFilter);
    setPage(await whapi.get<ContactPage>(`/contacts?${params.toString()}`));
  }, [pageNo, debouncedSearch, statusFilter, clusterFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadClusters();
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(errText(e, 'Could not load your contacts'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadClusters]);

  // Typing in the search box must not fire a query per keystroke against a
  // table that can hold tens of thousands of rows.
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search.trim()); setPageNo(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (tab !== 'contacts') return;
    loadContacts().catch((e) => setError(errText(e, 'Could not load contacts')));
  }, [tab, loadContacts]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const refreshAll = async () => {
    await Promise.all([
      loadClusters(),
      tab === 'contacts' ? loadContacts() : Promise.resolve(),
    ]);
  };

  const run = async (fn: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
    } catch (e) {
      setError(errText(e, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const openCluster = (cluster: Cluster) => {
    setClusterFilter(cluster.id);
    setStatusFilter('');
    setPageNo(1);
    setSelected(new Set());
    setTab('contacts');
  };

  const exportCluster = async (cluster: Cluster) => {
    // Not through whapi: this response is a file, not JSON.
    const { token, workspaceId } = getAuth();
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/clusters/${cluster.id}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cluster.name.replace(/[^a-z0-9_-]+/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Deletes the list, never the people. Contacts stay in the address book with
  // their call history and opt-out state intact — losing an opt-out because
  // someone tidied up a list is not a trade worth offering.
  const deleteCluster = (cluster: Cluster) => {
    if (!window.confirm(
      `Delete the cluster "${cluster.name}"?\n\n`
      + `Its ${cluster.contactCount} contact(s) stay in your address book — only the list is removed.`,
    )) return;
    run(async () => {
      await whapi.delete(`/clusters/${cluster.id}`);
      if (clusterFilter === cluster.id) setClusterFilter('');
      await refreshAll();
      setNotice(`Deleted the cluster “${cluster.name}”. Its contacts were kept.`);
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allOnPageSelected = page.rows.length > 0 && page.rows.every((c) => selected.has(c.id));

  const toggleAll = () => setSelected((prev) => {
    if (allOnPageSelected) return new Set();
    const next = new Set(prev);
    page.rows.forEach((c) => next.add(c.id));
    return next;
  });

  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const bulkStatus = (status: 'ACTIVE' | 'OPTED_OUT') => run(async () => {
    await whapi.post('/contacts/status', { contactIds: selectedIds, status });
    setSelected(new Set());
    await refreshAll();
  }, status === 'OPTED_OUT'
    ? `${selectedIds.length} contact(s) opted out — they will not be dialled again.`
    : `${selectedIds.length} contact(s) reactivated.`);

  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.length} contact(s)? They will be removed from every list.`)) return;
    run(async () => {
      await whapi.post('/contacts/delete', { contactIds: selectedIds });
      setSelected(new Set());
      await refreshAll();
    }, 'Contacts deleted.');
  };

  const bulkRemoveFromCluster = () => run(async () => {
    await whapi.post(`/clusters/${clusterFilter}/remove`, { contactIds: selectedIds });
    setSelected(new Set());
    await refreshAll();
  }, 'Removed from this list. The contacts themselves were kept.');

  const totalPages = Math.max(1, Math.ceil(page.total / (page.pageSize || PAGE_SIZE)));
  const activeCluster = clusters.find((c) => c.id === clusterFilter) ?? null;

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap-wide">
        {/* Header */}
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Operate</div>
            <h1 className="rz-h1">Call contacts</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0' }}>
              Keep your numbers in named lists, then point a campaign at a list instead of hunting for the CSV.
            </p>
          </div>
          <div className="rz-head-actions">
            <button className="rz-btn rz-btn-secondary" onClick={() => setAddContactOpen(true)}>
              Add contact
            </button>
            <button className="rz-btn rz-btn-primary" onClick={() => setImportOpen(true)}>
              Import CSV
            </button>
          </div>
        </div>

        {/* Counts. Opt-outs are shown next to the total on purpose — a list is
            never as dialable as its row count suggests. */}
        {summary && (
          <div className="rz-stats" style={{ marginBottom: '18px' }}>
            <div className="rz-stat">
              <div className="rz-stat-label">CONTACTS</div>
              <div className="rz-stat-value">{summary.total.toLocaleString()}</div>
              <div className="rz-stat-delta">{summary.clusters} list{summary.clusters === 1 ? '' : 's'}</div>
            </div>
            <div className="rz-stat">
              <div className="rz-stat-label">DIALABLE</div>
              <div className="rz-stat-value" style={{ color: 'var(--lime)' }}>{summary.active.toLocaleString()}</div>
              <div className="rz-stat-delta">reachable right now</div>
            </div>
            <div className="rz-stat">
              <div className="rz-stat-label">OPTED OUT</div>
              <div className="rz-stat-value" style={{ color: summary.optedOut ? 'var(--warn)' : undefined }}>
                {summary.optedOut.toLocaleString()}
              </div>
              <div className="rz-stat-delta">never dialled again</div>
            </div>
            <div className="rz-stat">
              <div className="rz-stat-label">INVALID</div>
              <div className="rz-stat-value" style={{ color: summary.invalid ? 'var(--err)' : undefined }}>
                {summary.invalid.toLocaleString()}
              </div>
              <div className="rz-stat-delta">unreachable numbers</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div className="rz-tabs">
            <button className={`rz-tab ${tab === 'clusters' ? 'is-active' : ''}`} onClick={() => setTab('clusters')}>
              Clusters
            </button>
            <button className={`rz-tab ${tab === 'contacts' ? 'is-active' : ''}`} onClick={() => setTab('contacts')}>
              All contacts
            </button>
          </div>
          {tab === 'clusters' && (
            <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={() => setNewClusterOpen(true)}>
              New empty cluster
            </button>
          )}
          {tab === 'contacts' && activeCluster && (
            <span className="rz-tag">
              Showing “{activeCluster.name}”
              <button
                onClick={() => { setClusterFilter(''); setPageNo(1); }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 6 }}
                aria-label="Clear list filter"
              >
                ×
              </button>
            </span>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: 13 }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--lime)', fontSize: 13 }}>
            {notice}
          </div>
        )}

        {tab === 'clusters' ? (
          <ClusterGrid
            clusters={clusters}
            loading={loading}
            onOpen={openCluster}
            onRename={setRenaming}
            onExport={(c) => run(() => exportCluster(c))}
            onDelete={deleteCluster}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <input
                className="rz-input"
                style={{ minWidth: 260 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, number, email, company…"
              />
              <select
                className="rz-select"
                value={clusterFilter}
                onChange={(e) => { setClusterFilter(e.target.value); setPageNo(1); setSelected(new Set()); }}
              >
                <option value="">All lists</option>
                {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                className="rz-select"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPageNo(1); }}
              >
                <option value="">Any status</option>
                <option value="ACTIVE">Active</option>
                <option value="OPTED_OUT">Opted out</option>
                <option value="INVALID">Invalid</option>
              </select>
            </div>

            {selected.size > 0 && (
              <div className="rz-enter" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--s2)', flexWrap: 'wrap' }}>
                <span className="rz-mono">{selected.size} selected</span>
                <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busy} onClick={() => setAddToClusterOpen(true)}>
                  Add to cluster
                </button>
                {clusterFilter && (
                  <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busy} onClick={bulkRemoveFromCluster}>
                    Remove from this list
                  </button>
                )}
                <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busy} onClick={() => bulkStatus('OPTED_OUT')}>
                  Mark opted out
                </button>
                <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busy} onClick={() => bulkStatus('ACTIVE')}>
                  Reactivate
                </button>
                <button className="rz-btn rz-btn-danger rz-btn-sm" disabled={busy} onClick={bulkDelete}>
                  Delete
                </button>
              </div>
            )}

            <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--s1)' }}>
              <div className="rz-table-wrap">
                <table className="rz-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleAll}
                          aria-label="Select all on this page"
                          style={{ width: 16, height: 16, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                        />
                      </th>
                      <th>Name</th>
                      <th>Number</th>
                      <th>Lists</th>
                      <th>Status</th>
                      <th>Calls</th>
                      <th>Last called</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.length ? page.rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleOne(c.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--cyan)', cursor: 'pointer' }}
                          />
                        </td>
                        <td className="rz-td-strong">
                          {c.name || <span style={{ color: 'var(--tx-3)' }}>—</span>}
                          {(c.company || c.email) && (
                            <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx-3)', marginTop: 3 }}>
                              {[c.company, c.email].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="rz-td-mono">{c.phoneNumber}</td>
                        <td>
                          <div className="rz-cluster-sm">
                            {c.clusters.length
                              ? c.clusters.slice(0, 3).map((cl) => (
                                <span key={cl.id} className="rz-tag">{cl.name}</span>
                              ))
                              : <span style={{ color: 'var(--tx-3)' }}>no list</span>}
                            {c.clusters.length > 3 && (
                              <span className="rz-mono-xs">+{c.clusters.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={STATUS_PILL[c.status] ?? 'rz-pill rz-pill-idle'}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td>{c.callCount}</td>
                        <td>{c.lastCalledAt ? new Date(c.lastCalledAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7}>
                          <div className="rz-empty">
                            <div className="rz-empty-title">No contacts here yet</div>
                            <div className="rz-empty-text">
                              {debouncedSearch || statusFilter || clusterFilter
                                ? 'Nothing matches those filters.'
                                : 'Import a CSV to create your first list, or add a contact by hand.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {page.total > 0 && (
              <div className="rz-between" style={{ marginTop: 12 }}>
                <span className="rz-mono-xs">
                  {(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.total)} of {page.total.toLocaleString()}
                </span>
                <div className="rz-cluster-sm">
                  <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={page.page <= 1} onClick={() => setPageNo((p) => p - 1)}>
                    Previous
                  </button>
                  <span className="rz-mono-xs">page {page.page} / {totalPages}</span>
                  <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={page.page >= totalPages} onClick={() => setPageNo((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {importOpen && (
        <ImportModal
          clusters={clusters}
          onClose={() => setImportOpen(false)}
          onDone={async (result) => {
            setImportOpen(false);
            setImportResult(result);
            await refreshAll();
          }}
        />
      )}

      {importResult && (
        <ImportReport
          result={importResult}
          onClose={() => setImportResult(null)}
          onView={(cluster) => { setImportResult(null); openCluster(cluster); }}
        />
      )}

      {newClusterOpen && (
        <ClusterFormModal
          title="New cluster"
          submitLabel="Create cluster"
          onClose={() => setNewClusterOpen(false)}
          onSubmit={async (values) => {
            await whapi.post('/clusters', values);
            setNewClusterOpen(false);
            await refreshAll();
          }}
        />
      )}

      {renaming && (
        <ClusterFormModal
          title="Rename cluster"
          submitLabel="Save"
          initial={{ name: renaming.name, description: renaming.description ?? '' }}
          onClose={() => setRenaming(null)}
          onSubmit={async (values) => {
            await whapi.patch(`/clusters/${renaming.id}`, values);
            setRenaming(null);
            await refreshAll();
          }}
        />
      )}

      {addContactOpen && (
        <AddContactModal
          clusters={clusters}
          onClose={() => setAddContactOpen(false)}
          onDone={async () => { setAddContactOpen(false); await refreshAll(); }}
        />
      )}

      {addToClusterOpen && (
        <AddToClusterModal
          clusters={clusters}
          count={selected.size}
          onClose={() => setAddToClusterOpen(false)}
          onSubmit={async (body) => {
            await whapi.post('/contacts/add-to-clusters', { ...body, contactIds: selectedIds });
            setAddToClusterOpen(false);
            setSelected(new Set());
            await refreshAll();
            setNotice('Added to the cluster.');
          }}
        />
      )}
    </div>
  );
}

/* ── Cluster grid ─────────────────────────────────────────────────────── */

function ClusterGrid({ clusters, loading, onOpen, onRename, onExport, onDelete, onImport }: {
  clusters: Cluster[];
  loading: boolean;
  onOpen: (c: Cluster) => void;
  onRename: (c: Cluster) => void;
  onExport: (c: Cluster) => void;
  onDelete: (c: Cluster) => void;
  onImport: () => void;
}) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {[0, 1, 2].map((i) => <div key={i} className="rz-skeleton" style={{ height: 148 }} />)}
      </div>
    );
  }

  if (!clusters.length) {
    return (
      <div className="rz-card rz-card-lg">
        <div className="rz-empty">
          <div className="rz-empty-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="rz-empty-title">No clusters yet</div>
          <div className="rz-empty-text">
            A cluster is a named list of numbers. Import a CSV and it becomes one — then every campaign
            from then on is a matter of picking the list, not finding the file again.
          </div>
          <button className="rz-btn rz-btn-primary" style={{ marginTop: 6 }} onClick={onImport}>
            Import your first CSV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
      {clusters.map((c) => {
        const blocked = c.contactCount - c.dialableCount;
        return (
          <div key={c.id} className="rz-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="rz-between" style={{ alignItems: 'flex-start' }}>
                <button
                  onClick={() => onOpen(c)}
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--tx)', font: 'inherit' }}
                  className="rz-title"
                >
                  {c.name}
                </button>
                <span className="rz-mono-xs">{SOURCE_LABEL[c.source] ?? c.source}</span>
              </div>
              {c.description && (
                <p className="rz-sub" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{c.description}</p>
              )}
            </div>

            <div className="rz-cluster">
              <div>
                <div className="rz-stat-label">CONTACTS</div>
                <div className="rz-metric-sm">{c.contactCount.toLocaleString()}</div>
              </div>
              <div>
                <div className="rz-stat-label">DIALABLE</div>
                <div className="rz-metric-sm" style={{ color: c.dialableCount ? 'var(--lime)' : 'var(--tx-3)' }}>
                  {c.dialableCount.toLocaleString()}
                </div>
              </div>
              {blocked > 0 && (
                <div>
                  <div className="rz-stat-label">HELD BACK</div>
                  <div className="rz-metric-sm" style={{ color: 'var(--warn)' }}>{blocked.toLocaleString()}</div>
                </div>
              )}
            </div>

            <div className="rz-cluster-sm" style={{ marginTop: 'auto' }}>
              <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={() => onOpen(c)}>View</button>
              <button className="rz-btn rz-btn-ghost rz-btn-sm" onClick={() => onRename(c)}>Rename</button>
              <button className="rz-btn rz-btn-ghost rz-btn-sm" onClick={() => onExport(c)}>Export</button>
              <button className="rz-btn rz-btn-ghost rz-btn-sm" style={{ color: 'var(--err)' }} onClick={() => onDelete(c)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared modal shell ───────────────────────────────────────────────── */

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="rz-enter" style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: 'var(--s1)', borderRadius: 20, border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', padding: 28 }}>
        <div className="rz-between" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{title}</h2>
            {subtitle && <p className="rz-sub" style={{ margin: '7px 0 0', fontSize: 13 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx-2)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Import ───────────────────────────────────────────────────────────── */

function ImportModal({ clusters, onClose, onDone }: {
  clusters: Cluster[];
  onClose: () => void;
  onDone: (result: { cluster: Cluster; summary: ImportSummary }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (file && !name) setName(file.name.replace(/\.csv$/i, ''));
  }, [file, name]);

  const submit = async () => {
    if (!file) { setErr('Choose a CSV file'); return; }
    if (target === 'existing' && !clusterId) { setErr('Pick the cluster to add these contacts to'); return; }
    setSaving(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (target === 'existing') form.append('clusterId', clusterId);
      else {
        form.append('clusterName', name.trim());
        if (description.trim()) form.append('description', description.trim());
      }
      onDone(await whapi.postForm<{ cluster: Cluster; summary: ImportSummary }>('/contacts/import', form));
    } catch (e) {
      setErr(errText(e, 'Import failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Import contacts"
      subtitle="Any CSV with a phone column. Names, emails and companies are picked up automatically; every other column is kept with the contact."
      onClose={onClose}
    >
      <div className="rz-stack">
        <div className="rz-field">
          <label className="rz-field-label">CSV file</label>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ color: 'var(--tx)' }} />
          <span className="rz-field-hint">
            Numbers are normalised to E.164 — 9876543210, 09876543210 and +91 98765 43210 are one contact, not three.
          </span>
        </div>

        <div className="rz-field">
          <label className="rz-field-label">Put them in</label>
          <div className="rz-tabs" style={{ alignSelf: 'flex-start' }}>
            <button className={`rz-tab ${target === 'new' ? 'is-active' : ''}`} onClick={() => setTarget('new')}>A new cluster</button>
            <button className={`rz-tab ${target === 'existing' ? 'is-active' : ''}`} onClick={() => setTarget('existing')}>An existing one</button>
          </div>
        </div>

        {target === 'new' ? (
          <>
            <div className="rz-field">
              <label className="rz-field-label">Cluster name</label>
              <input className="rz-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali leads — Delhi" />
              <span className="rz-field-hint">Renameable later; a clash gets a number appended rather than failing.</span>
            </div>
            <div className="rz-field">
              <label className="rz-field-label">Description <span className="rz-muted">(optional)</span></label>
              <input className="rz-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where this list came from" />
            </div>
          </>
        ) : (
          <div className="rz-field">
            <label className="rz-field-label">Cluster</label>
            <select className="rz-select" value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
              <option value="">Choose a cluster…</option>
              {clusters.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contactCount})</option>)}
            </select>
            <span className="rz-field-hint">Contacts already in it are updated, not duplicated.</span>
          </div>
        )}

        {err && <div className="rz-field-error">{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="rz-btn rz-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="rz-btn rz-btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * What the import actually did.
 *
 * Shown rather than a toast because the interesting numbers are the ones people
 * would otherwise never learn: how many rows were unreadable, and how many were
 * the same person twice.
 */
function ImportReport({ result, onClose, onView }: {
  result: { cluster: Cluster; summary: ImportSummary };
  onClose: () => void;
  onView: (c: Cluster) => void;
}) {
  const s = result.summary;
  const rows: [string, number | string, string?][] = [
    ['Rows read', s.rows],
    ['New contacts', s.created],
    ['Existing contacts updated', s.updated],
    ['Duplicates within the file', s.duplicatesInFile],
    ['Unreadable rows', s.invalid, s.invalid ? 'err' : undefined],
    ['Now in this cluster', s.clusterTotal],
  ];
  return (
    <Modal title="Import complete" subtitle={`“${result.cluster.name}” is ready to dial.`} onClose={onClose}>
      <div className="rz-stack-sm">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="rz-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--tx-2)', fontSize: 13 }}>{label}</span>
            <span className="rz-mono" style={{ color: tone === 'err' && value ? 'var(--err)' : 'var(--tx)' }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
          </div>
        ))}
        {s.invalidSamples?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="rz-field-label" style={{ marginBottom: 6 }}>Rows we could not read a number from</div>
            <ul className="rz-mono-xs" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {s.invalidSamples.map((sample) => <li key={sample}>{sample}</li>)}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button className="rz-btn rz-btn-secondary" onClick={onClose}>Done</button>
          <button className="rz-btn rz-btn-primary" onClick={() => onView(result.cluster)}>View contacts</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Cluster create / rename ──────────────────────────────────────────── */

function ClusterFormModal({ title, submitLabel, initial, onClose, onSubmit }: {
  title: string;
  submitLabel: string;
  initial?: { name: string; description: string };
  onClose: () => void;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr('Give the cluster a name'); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
    } catch (e) {
      setErr(errText(e, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="rz-stack">
        <div className="rz-field">
          <label className="rz-field-label">Name</label>
          <input className="rz-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="rz-field">
          <label className="rz-field-label">Description <span className="rz-muted">(optional)</span></label>
          <input className="rz-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {err && <div className="rz-field-error">{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="rz-btn rz-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="rz-btn rz-btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Add one contact ──────────────────────────────────────────────────── */

function AddContactModal({ clusters, onClose, onDone }: {
  clusters: Cluster[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ phoneNumber: '', name: '', email: '', company: '', notes: '' });
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.phoneNumber.trim()) { setErr('A phone number is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await whapi.post('/contacts', { ...form, clusterIds });
      await onDone();
    } catch (e) {
      setErr(errText(e, 'Could not add the contact'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add contact" onClose={onClose}>
      <div className="rz-stack">
        <div className="rz-field">
          <label className="rz-field-label">Phone number</label>
          <input className="rz-input" value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} placeholder="+91 98765 43210" autoFocus />
          <span className="rz-field-hint">A 10-digit number is treated as Indian. Include the country code for anywhere else.</span>
        </div>
        <div className="rz-field">
          <label className="rz-field-label">Name</label>
          <input className="rz-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="rz-field">
            <label className="rz-field-label">Email</label>
            <input className="rz-input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="rz-field">
            <label className="rz-field-label">Company</label>
            <input className="rz-input" value={form.company} onChange={(e) => set('company', e.target.value)} />
          </div>
        </div>
        {clusters.length > 0 && (
          <div className="rz-field">
            <label className="rz-field-label">Add to clusters</label>
            <div style={{ maxHeight: 132, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8, background: 'var(--s2)' }}>
              {clusters.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={clusterIds.includes(c.id)}
                    onChange={() => setClusterIds((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                    style={{ accentColor: 'var(--cyan)' }}
                  />
                  <span style={{ color: 'var(--tx)', fontSize: 13 }}>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {err && <div className="rz-field-error">{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="rz-btn rz-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="rz-btn rz-btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : 'Add contact'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Add selection to a cluster ───────────────────────────────────────── */

function AddToClusterModal({ clusters, count, onClose, onSubmit }: {
  clusters: Cluster[];
  count: number;
  onClose: () => void;
  onSubmit: (body: { clusterIds?: string[]; newClusterName?: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(clusters.length ? 'existing' : 'new');
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (mode === 'existing' && !clusterIds.length) { setErr('Pick at least one cluster'); return; }
    if (mode === 'new' && !newName.trim()) { setErr('Name the new cluster'); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit(mode === 'new' ? { newClusterName: newName.trim() } : { clusterIds });
    } catch (e) {
      setErr(errText(e, 'Could not add to the cluster'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Add ${count} contact${count === 1 ? '' : 's'} to a cluster`} onClose={onClose}>
      <div className="rz-stack">
        <div className="rz-tabs" style={{ alignSelf: 'flex-start' }}>
          <button className={`rz-tab ${mode === 'existing' ? 'is-active' : ''}`} onClick={() => setMode('existing')}>Existing</button>
          <button className={`rz-tab ${mode === 'new' ? 'is-active' : ''}`} onClick={() => setMode('new')}>New cluster</button>
        </div>

        {mode === 'existing' ? (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8, background: 'var(--s2)' }}>
            {clusters.length ? clusters.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={clusterIds.includes(c.id)}
                  onChange={() => setClusterIds((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                  style={{ accentColor: 'var(--cyan)' }}
                />
                <span style={{ color: 'var(--tx)', fontSize: 13 }}>{c.name} <span className="rz-muted">({c.contactCount})</span></span>
              </label>
            )) : <div className="rz-field-hint">No clusters yet — create one instead.</div>}
          </div>
        ) : (
          <div className="rz-field">
            <label className="rz-field-label">New cluster name</label>
            <input className="rz-input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </div>
        )}

        {err && <div className="rz-field-error">{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="rz-btn rz-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="rz-btn rz-btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
