import { useState, useMemo, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { CallLog, CallStatus } from '../../data/mockCallLogs';
import { StatusBadge } from './StatusBadge';
import { CallLogDrawer } from './CallLogDrawer';

const PAGE_SIZE = 10;

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type SortKey = keyof Pick<CallLog, 'customerName' | 'timestamp' | 'durationSec' | 'status'>;

interface CallLogsTableProps {
  logs: CallLog[];
}

export function CallLogsTable({ logs }: CallLogsTableProps) {
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState<CallStatus | 'all'>('all');
  const [sortKey, setSortKey]       = useState<SortKey>('timestamp');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<CallLog | null>(null);
  const [showFilters, setFilters]   = useState(false);

  const filtered = useMemo(() => {
    let list = logs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.customerName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.id.toLowerCase().includes(q) ||
        l.outcome.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
    return list;
  }, [logs, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = a[sortKey] as string | number;
      let bv: string | number = b[sortKey] as string | number;
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
  }, [filtered, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(1);
  }, [sortKey]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} style={{ color: '#444' }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} style={{ color: '#00bcd4' }} /> : <ChevronDown size={12} style={{ color: '#00bcd4' }} />;
  };

  const COL_HEAD: { label: string; key?: SortKey; width?: number }[] = [
    { label: 'Call ID',      width: 90 },
    { label: 'Customer',     key: 'customerName', width: 160 },
    { label: 'Phone',        width: 140 },
    { label: 'Date',         key: 'timestamp', width: 140 },
    { label: 'Duration',     key: 'durationSec', width: 100 },
    { label: 'Status',       key: 'status', width: 120 },
    { label: 'Outcome',      width: 150 },
    { label: 'Agent',        width: 90 },
    { label: 'Actions',      width: 80 },
  ];

  return (
    <>
      <CallLogDrawer log={selected} onClose={() => setSelected(null)} />

      <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 14, overflow: 'hidden' }}>

        {/* ── Table toolbar ──────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          background: '#080808',
        }}>
          {/* Search */}
          <div style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#111',
            border: '1px solid #222',
            borderRadius: 8,
            padding: '7px 12px',
          }}>
            <Search size={13} style={{ color: '#555', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search by name, phone, ID or outcome…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e8e8e8',
                fontSize: 13,
                width: '100%',
              }}
            />
          </div>

          {/* Status filter */}
          <button
            onClick={() => setFilters(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: showFilters ? '#00bcd420' : '#111',
              border: `1px solid ${showFilters ? '#00bcd440' : '#222'}`,
              borderRadius: 8,
              color: showFilters ? '#00bcd4' : '#888',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Filter size={12} />
            Filters
          </button>

          {/* Count */}
          <span style={{ fontSize: 12, color: '#444', flexShrink: 0 }}>
            {sorted.length} call{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid #1a1a1a',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            background: '#090909',
          }}>
            {(['all', 'completed', 'missed', 'transferred', 'failed', 'voicemail'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  background: statusFilter === s ? '#00bcd415' : 'transparent',
                  border: `1px solid ${statusFilter === s ? '#00bcd440' : '#222'}`,
                  color: statusFilter === s ? '#00bcd4' : '#666',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s === 'all' ? 'All Statuses' : s}
              </button>
            ))}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 1 }}>
                {COL_HEAD.map(col => (
                  <th
                    key={col.label}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{
                      padding: '11px 14px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#555',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid #1a1a1a',
                      cursor: col.key ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      minWidth: col.width,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {col.label}
                      {col.key && <SortIcon col={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={COL_HEAD.length} style={{ textAlign: 'center', padding: '60px 20px', color: '#444' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No call logs match your search</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting the filters or search query</div>
                  </td>
                </tr>
              ) : paginated.map((log, i) => (
                <tr
                  key={log.id}
                  onClick={() => setSelected(log)}
                  style={{
                    borderBottom: '1px solid #141414',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseOver={e => (e.currentTarget as HTMLTableRowElement).style.background = '#111'}
                  onMouseOut={e  => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, color: '#555' }}>{log.id}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#e0e0e0' }}>{log.customerName}</td>
                  <td style={{ padding: '12px 14px', color: '#888' }}>{log.phone}</td>
                  <td style={{ padding: '12px 14px', color: '#666' }}>{fmtDate(log.timestamp)}</td>
                  <td style={{ padding: '12px 14px', color: '#888' }}>{fmtDuration(log.durationSec)}</td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={log.status} size="sm" /></td>
                  <td style={{ padding: '12px 14px', color: '#999', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.outcome}</td>
                  <td style={{ padding: '12px 14px', color: '#666', fontSize: 12 }}>{log.agent}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setSelected(log); }}
                      style={{
                        padding: '4px 10px',
                        background: '#111',
                        border: '1px solid #222',
                        borderRadius: 6,
                        color: '#00bcd4',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────── */}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#080808',
        }}>
          <span style={{ fontSize: 12, color: '#444' }}>
            Page {page} of {pages} · {sorted.length} total records
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <PaginationBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </PaginationBtn>
            {Array.from({ length: pages }, (_, i) => i + 1).slice(
              Math.max(0, page - 3),
              Math.min(pages, page + 2)
            ).map(p => (
              <PaginationBtn key={p} active={p === page} onClick={() => setPage(p)}>
                {p}
              </PaginationBtn>
            ))}
            <PaginationBtn disabled={page === pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </PaginationBtn>
          </div>
        </div>
      </div>
    </>
  );
}

function PaginationBtn({ children, disabled, active, onClick }: {
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? '#00bcd4' : '#111',
        border: `1px solid ${active ? '#00bcd4' : '#222'}`,
        borderRadius: 6,
        color: active ? '#000' : disabled ? '#333' : '#888',
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
