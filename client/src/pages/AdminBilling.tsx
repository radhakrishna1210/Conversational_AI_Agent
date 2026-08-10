import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard, ChevronLeft, ChevronRight, AlertCircle, RefreshCw,
  TrendingUp, Wallet, X,
} from 'lucide-react';
import { adminFetch, qs } from '@/lib/adminApi';
import { AdminPageHeader } from './AdminPanel';

// Subscriptions are gone with plans — this deployment sells talk-minutes
// against a prepaid wallet, so there is nothing recurring to list.
type Section = 'payments' | 'invoices' | 'wallets';

/**
 * The sign goes BEFORE the currency symbol, not after it. Formatting the raw
 * negative through toLocaleString yields "₹-28,660.14", which reads as a
 * corrupted amount rather than a debit.
 */
const fmtMoney = (cents: number, cur = 'INR') => {
  const symbol = cur === 'INR' ? '₹' : '$';
  const abs = Math.abs(cents) / 100;
  return `${cents < 0 ? '-' : ''}${symbol}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--cyan-fg)', paid: 'var(--cyan-fg)', Paid: 'var(--cyan-fg)',
  past_due: 'var(--warn)', failed: 'var(--err)', cancelled: 'var(--tx-2)',
  expired: 'var(--tx-2)', created: 'var(--cyan-fg)', refunded: 'var(--violet)',
};

export default function AdminBilling() {
  const [section, setSection] = useState<Section>('wallets');
  const [ledgerFor, setLedgerFor] = useState<{ id: string; name: string } | null>(null);

  const { data: overview, isError: ovError, error: ovErr, refetch: refetchOv } = useQuery({
    queryKey: ['admin', 'billing', 'overview'],
    queryFn: () => adminFetch('/billing/overview'),
  });

  return (
    <>
      <AdminPageHeader
        title="Billing"
        subtitle="Wallet balances, top-ups and invoices across every tenant"
        icon={<CreditCard size={21} />}
      />

      {ovError && (
        <ErrorBar message={(ovErr as Error)?.message ?? 'Could not load billing overview'} onRetry={() => refetchOv()} />
      )}

      {overview && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', marginBottom: 20 }}>
          <Stat label="Revenue today" value={fmtMoney(overview.revenueTodayCents)} sub={`${overview.paymentsToday} payments`} icon={<TrendingUp size={15} />} color="var(--violet)" />
          <Stat label="Revenue this month" value={fmtMoney(overview.revenueMonthCents)} sub={`${overview.paymentsMonth} payments`} icon={<TrendingUp size={15} />} color="var(--cyan-fg)" />
          <Stat label="Failed payments" value={overview.failedPaymentsMonth} sub="this month" icon={<AlertCircle size={15} />} color={overview.failedPaymentsMonth > 0 ? 'var(--err)' : 'var(--tx-2)'} />
          <Stat label="Wallet float" value={fmtMoney(overview.walletFloatCents)} sub={`${overview.walletCount} wallets`} icon={<Wallet size={15} />} color="var(--warn)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {([
          ['payments', 'Payments'],
          ['invoices', 'Invoices'], ['wallets', 'Wallets'],
        ] as [Section, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} style={{
            padding: '9px 16px', background: 'transparent', border: 'none',
            borderBottom: section === id ? '2px solid var(--cyan-fg)' : '2px solid transparent',
            color: section === id ? 'var(--cyan-fg)' : 'var(--tx-2)',
            fontWeight: section === id ? 700 : 500, fontSize: 13.5, cursor: 'pointer', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {section === 'payments' && <Payments />}
      {section === 'invoices' && <Invoices />}
      {section === 'wallets' && <Wallets onOpenLedger={setLedgerFor} />}

      {ledgerFor && <LedgerDrawer workspaceId={ledgerFor.id} name={ledgerFor.name} onClose={() => setLedgerFor(null)} />}
    </>
  );
}

// ─── Payments ────────────────────────────────────────────────────────────────

function Payments() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'billing', 'payments', { page, status }],
    queryFn: () => adminFetch(`/billing/payments${qs({ page, limit: 25, status })}`),
  });

  return (
    <Panel
      query={q} emptyText="No payments match these filters."
      filters={<Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
        { v: '', l: 'All statuses' }, { v: 'paid', l: 'Paid' }, { v: 'failed', l: 'Failed' },
        { v: 'created', l: 'Created (unpaid)' }, { v: 'refunded', l: 'Refunded' },
      ]} />}
      headers={['Created', 'Workspace', 'Amount', 'Purpose', 'Status', 'Gateway ref']}
      rows={(q.data?.payments ?? []).map((p: any) => [
        <>{fmtDate(p.createdAt)}{p.paidAt && <Sub>paid {fmtDate(p.paidAt)}</Sub>}</>,
        <WorkspaceCell ws={p.workspace} fallback={p.workspaceId} />,
        <span style={{ color: 'var(--tx)', fontWeight: 600 }}>{fmtMoney(p.amountCents, p.currency)}</span>,
        p.purpose,
        <Badge value={p.status} />,
        <code style={{ fontSize: 11 }}>{p.providerPaymentId ?? p.providerOrderId ?? '—'}</code>,
      ])}
      page={page} setPage={setPage} unit="payments"
    />
  );
}

// ─── Invoices ────────────────────────────────────────────────────────────────

function Invoices() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'billing', 'invoices', { page, type }],
    queryFn: () => adminFetch(`/billing/invoices${qs({ page, limit: 25, type })}`),
  });

  const flagged = (q.data?.invoices ?? []).filter((i: any) => i.suspectedDuplicate).length;

  return (
    <>
      {flagged > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', marginBottom: 14,
          borderRadius: 9, border: '1px solid rgba(245,158,11,0.32)', background: 'rgba(245,158,11,0.07)',
          color: 'var(--warn)', fontSize: 12.5, lineHeight: 1.5,
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>{flagged} invoice{flagged === 1 ? '' : 's'} on this page look duplicated.</strong> A plan
            upgrade paid by card issues one invoice anchored to the payment and a second
            &ldquo;prorated upgrade&rdquo; invoice with no payment reference, so one payment produces two tax
            documents. The wallet ledger is unaffected — balances are correct. Flagged for review only;
            nothing has been deleted.
          </span>
        </div>
      )}
      <Panel
        query={q} emptyText="No invoices match these filters."
        filters={<Select value={type} onChange={(v) => { setType(v); setPage(1); }} options={[
          { v: '', l: 'All types' }, { v: 'topup', l: 'Top-up' },
        ]} />}
        headers={['Number', 'Date', 'Workspace', 'Description', 'Amount', 'Payment', '']}
        rows={(q.data?.invoices ?? []).map((i: any) => [
          i.number ?? <span style={{ color: 'var(--warn)' }}>(no number)</span>,
          fmtDate(i.invoiceDate),
          <WorkspaceCell ws={i.workspace} fallback={i.workspaceId} />,
          <>{i.planName}<Sub>{i.type}</Sub></>,
          <span style={{ color: 'var(--tx)', fontWeight: 600 }}>
            {fmtMoney(i.amountCents, i.currency)}
            {i.taxCents > 0 && <Sub>incl. tax {fmtMoney(i.taxCents, i.currency)}</Sub>}
          </span>,
          i.paymentOrderId
            ? <span style={{ color: 'var(--cyan-fg)', fontSize: 11.5 }}>anchored</span>
            : <span style={{ color: 'var(--tx-2)', fontSize: 11.5 }}>no order</span>,
          i.suspectedDuplicate
            ? <span style={{ color: 'var(--warn)', fontSize: 11, fontWeight: 700 }}>duplicate?</span>
            : '',
        ])}
        page={page} setPage={setPage} unit="invoices"
      />
    </>
  );
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

function Wallets({ onOpenLedger }: { onOpenLedger: (w: { id: string; name: string }) => void }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'billing', 'wallets', { page }],
    queryFn: () => adminFetch(`/billing/wallets${qs({ page, limit: 25 })}`),
  });

  return (
    <Panel
      query={q} emptyText="No wallets yet."
      headers={['Workspace', 'Balance', 'Overdraft limit', 'Last change', '']}
      rows={(q.data?.wallets ?? []).map((w: any) => [
        <WorkspaceCell ws={w.workspace} fallback={w.workspaceId} />,
        <span style={{ color: w.balanceCents < 0 ? 'var(--err)' : 'var(--tx)', fontWeight: 700 }}>
          {fmtMoney(w.balanceCents, w.currency)}
        </span>,
        w.overdraftLimitCents ? fmtMoney(w.overdraftLimitCents, w.currency) : '—',
        fmtDate(w.updatedAt),
        <button
          onClick={(e) => { e.stopPropagation(); onOpenLedger({ id: w.workspaceId, name: w.workspace?.name ?? w.workspaceId }); }}
          style={{
            padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)',
            background: 'transparent', color: 'var(--cyan-fg)', fontSize: 11.5, cursor: 'pointer',
          }}
        >View ledger</button>,
      ])}
      page={page} setPage={setPage} unit="wallets"
    />
  );
}

/** Paginated ledger for one workspace. */
function LedgerDrawer({ workspaceId, name, onClose }: { workspaceId: string; name: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'billing', 'ledger', workspaceId, page],
    queryFn: () => adminFetch(`/billing/wallets/${workspaceId}/ledger${qs({ page, limit: 25 })}`),
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(640px, 100%)', height: '100%', background: 'var(--s1)',
        borderLeft: '1px solid var(--line)', overflowY: 'auto', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--tx)' }}>Wallet ledger</h2>
            <div style={{ fontSize: 12.5, color: 'var(--tx-2)' }}>{name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--tx-2)', cursor: 'pointer' }}>
            <X size={19} />
          </button>
        </div>

        {isLoading && <Muted>Loading ledger…</Muted>}
        {isError && <ErrorBar message={(error as Error)?.message ?? 'Failed to load ledger'} />}

        {data && (
          <>
            <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--tx-2)' }}>Current balance</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)' }}>
                {fmtMoney(data.wallet.balanceCents, data.wallet.currency)}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>{['Date', 'Type', 'Amount', 'Balance after'].map((h) => (
                  <th key={h} style={{ ...thStyle, padding: '8px 10px' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.transactions.map((t: any) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--tx-2)' }}>{fmtDate(t.createdAt)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {t.type}
                      {t.note && <Sub>{t.note}</Sub>}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: t.amountCents >= 0 ? 'var(--cyan-fg)' : 'var(--err)' }}>
                      {t.amountCents > 0 ? '+' : ''}{fmtMoney(t.amountCents, data.wallet.currency)}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx)' }}>
                      {fmtMoney(t.balanceAfterCents, data.wallet.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pager page={page} pages={data.pages} total={data.total} unit="entries" setPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── shared ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '11px 14px', fontFamily: 'var(--ff-m)', fontSize: 10.5, fontWeight: 500, letterSpacing: '1px',
  color: 'var(--tx-3)', textTransform: 'uppercase',
  borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
};

/** Table + filters + pagination + every loading/empty/error state, once. */
function Panel({ query, headers, rows, page, setPage, unit, filters, emptyText }: {
  query: any; headers: string[]; rows: React.ReactNode[][];
  page: number; setPage: (n: number) => void; unit: string;
  filters?: React.ReactNode; emptyText: string;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = query;

  return (
    <>
      {(filters || true) && (
        <div style={{ display: 'flex', gap: 9, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {filters}
          <button onClick={() => refetch()} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--s1)',
            color: 'var(--tx-2)', fontSize: 13, cursor: 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : undefined }} /> Refresh
          </button>
        </div>
      )}

      {isError && <ErrorBar message={(error as Error)?.message ?? 'Request failed'} onRetry={() => refetch()} />}
      {isLoading && <Muted>Loading…</Muted>}
      {!isLoading && !isError && rows.length === 0 && <Muted>{emptyText}</Muted>}

      {rows.length > 0 && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--s1)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 780 }}>
              <thead><tr style={{ background: 'var(--bg-2)' }}>
                {headers.map((h) => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((cells, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    {cells.map((c, j) => (
                      <td key={j} style={{ padding: '10px 14px', color: 'var(--tx-2)', whiteSpace: 'nowrap' }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={data?.pages ?? 1} total={data?.total ?? 0} unit={unit} setPage={setPage} />
        </div>
      )}
    </>
  );
}

function Pager({ page, pages, total, unit, setPage }: { page: number; pages: number; total: number; unit: string; setPage: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--tx-2)' }}>
        {total} {unit} · page {page} of {Math.max(pages, 1)}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <PageBtn disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Prev</PageBtn>
        <PageBtn disabled={page >= (pages || 1)} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7,
      border: '1px solid var(--line)', background: 'transparent', fontSize: 12,
      color: disabled ? 'var(--tx-2)' : 'var(--tx)',
      opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  );
}

function Stat({ label, value, sub, icon, color }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderTop: `2px solid ${color}`, borderRadius: 10, padding: '13px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, color: 'var(--tx-2)', fontWeight: 600 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--tx-2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)',
      background: 'var(--s1)', color: 'var(--tx)', fontSize: 13, cursor: 'pointer',
    }}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function Badge({ value }: { value: string }) {
  const c = STATUS_COLOR[value] ?? 'var(--tx-2)';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${c}1f`, color: c }}>
      {value}
    </span>
  );
}

function WorkspaceCell({ ws, fallback }: { ws: { name: string } | null; fallback: string }) {
  if (!ws) return <span style={{ color: 'var(--warn)', fontSize: 12 }}>(deleted) {fallback.slice(0, 10)}…</span>;
  return <span style={{ color: 'var(--tx)' }}>{ws.name}</span>;
}

function Sub({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, color: 'var(--tx-2)', ...style }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--s1)', color: 'var(--tx-2)', fontSize: 13.5 }}>
      {children}
    </div>
  );
}

function ErrorBar({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
      padding: '11px 14px', marginBottom: 14, borderRadius: 9,
      border: '1px solid rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.07)', color: 'var(--err)', fontSize: 12.5,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={15} /> {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7,
          border: '1px solid rgba(239,68,68,0.32)', background: 'transparent', color: 'var(--err)', fontSize: 12, cursor: 'pointer',
        }}><RefreshCw size={12} /> Retry</button>
      )}
    </div>
  );
}
