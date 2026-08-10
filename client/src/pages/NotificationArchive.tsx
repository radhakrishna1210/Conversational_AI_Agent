import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationsApi, type Notification } from '@/lib/notificationsApi';
import { RzEmpty, RzSearch, RzSkeleton } from '@/components/rz';

/**
 * Notification archive — the grouped list from
 * Spandan Notification Archive.dc.html.
 *
 * This page used to render three hard-coded notifications ("Free Voice
 * Cloning!", a telephony announcement, a maintenance window dated June 2026)
 * that were the same for every workspace and never changed. It now reads the
 * real `/notifications` endpoint.
 *
 * "Archived" is not a server-side state — the API models read/unread and
 * delete, nothing else. So the archive is what has already been read, which is
 * the honest reading of the same idea. There is no Restore button for the same
 * reason: there is no mark-unread endpoint to call, and a button that silently
 * did nothing is worse than its absence.
 */

const TYPE_STYLE: Record<Notification['type'], { mark: string; icon: string }> = {
  SUCCESS:  { mark: 'rz-mark-lime',    icon: '✓' },
  ERROR:    { mark: 'rz-mark-coral',   icon: '!' },
  WARNING:  { mark: 'rz-mark-warn',    icon: '!' },
  CAMPAIGN: { mark: 'rz-mark-violet',  icon: '⇉' },
  MESSAGE:  { mark: '',                icon: '✉' },
  SYSTEM:   { mark: 'rz-mark-neutral', icon: '⚙' },
  INFO:     { mark: '',                icon: 'i' },
};

const FILTERS = [
  { value: '',         label: 'All' },
  { value: 'CAMPAIGN', label: 'Campaigns' },
  { value: 'SYSTEM',   label: 'System' },
  { value: 'WARNING',  label: 'Alerts' },
] as const;

/** Today / Yesterday / This week / Earlier — the design's four buckets. */
const bucketOf = (iso: string) => {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0 && then.getDate() === now.getDate()) return 'Today';
  if (days <= 1) return 'Yesterday';
  if (days <= 7) return 'This week';
  return 'Earlier';
};

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function NotificationArchive() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    notificationsApi
      .list({ limit: 200 })
      .then(r => setItems(r.notifications ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load notifications'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(n => n.read)                                   // archive = already read
      .filter(n => !filter || n.type === filter)
      .filter(n => !q || `${n.title} ${n.message}`.toLowerCase().includes(q));
  }, [items, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const b = bucketOf(n.createdAt);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(n);
    }
    return BUCKET_ORDER.filter(b => map.has(b)).map(b => ({ label: b, items: map.get(b)! }));
  }, [visible]);

  const remove = async (n: Notification) => {
    // Optimistic: the row is already read, so losing it costs nothing if the
    // request fails — and we re-read on failure anyway.
    setItems(prev => prev.filter(x => x.id !== n.id));
    try {
      await notificationsApi.delete(n.id);
    } catch {
      load();
    }
  };

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap" style={{ maxWidth: 760 }}>
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Notifications</div>
            <h1 className="rz-h1">Archive</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0' }}>
              Everything you have already read. Unread notifications stay in the bell menu.
            </p>
          </div>
          <div className="rz-head-actions">
            <RzSearch value={search} onChange={setSearch} placeholder="Search archived…" style={{ width: 240 }} />
          </div>
        </div>

        <div className="rz-cluster" style={{ marginBottom: 18 }}>
          {FILTERS.map(f => (
            <button
              key={f.label}
              className={`rz-chip ${filter === f.value ? 'is-active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <span className="rz-mono rz-spacer">{visible.length} archived</span>
        </div>

        {loading ? (
          <RzSkeleton rows={5} height={68} />
        ) : error ? (
          <div
            className="rz-card rz-between"
            style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: 13 }}
          >
            <span>{error}</span>
            <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={load}>Retry</button>
          </div>
        ) : !groups.length ? (
          <div style={{ border: '1.5px dashed var(--line-2)', borderRadius: 14 }}>
            <RzEmpty
              title={search || filter ? 'Nothing matches this filter' : 'Nothing archived yet'}
              text={
                search || filter
                  ? 'Clear the filter to see everything you have read.'
                  : 'Notifications land here once you have read them.'
              }
              action={<Link className="rz-btn rz-btn-secondary rz-btn-sm" to="/dashboard">Back to dashboard</Link>}
            />
          </div>
        ) : (
          groups.map(g => (
            <div key={g.label} style={{ marginBottom: 22 }}>
              <div className="rz-label" style={{ marginBottom: 10 }}>{g.label}</div>
              <div className="rz-stack-sm">
                {g.items.map(n => {
                  const t = TYPE_STYLE[n.type] ?? TYPE_STYLE.INFO;
                  return (
                    <div
                      key={n.id}
                      style={{
                        display: 'flex', gap: 13, padding: '14px 16px', borderRadius: 12,
                        border: '1px solid var(--line)', background: 'var(--bg-2)',
                      }}
                    >
                      <span className={`rz-mark ${t.mark}`} style={{ width: 34, height: 34 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--tx)' }}>{n.title}</div>
                        <div className="rz-sub" style={{ fontSize: 12.5, marginTop: 2 }}>{n.message}</div>
                        <div className="rz-mono-xs" style={{ marginTop: 6 }}>{timeOf(n.createdAt)}</div>
                        {n.actionLink && n.actionText && (
                          <Link
                            to={n.actionLink}
                            className="rz-mono"
                            style={{ color: 'var(--cyan-fg)', display: 'inline-block', marginTop: 8 }}
                          >
                            {n.actionText} →
                          </Link>
                        )}
                      </div>
                      <button
                        className="rz-btn rz-btn-secondary rz-btn-sm"
                        style={{ alignSelf: 'center', flexShrink: 0 }}
                        onClick={() => remove(n)}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
