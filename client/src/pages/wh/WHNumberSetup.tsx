import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NumberData = {
  phoneNumber: string;
  displayName: string;
  qualityRating: string;
  messagingLimit: string;
  status: string;
  metaError: boolean;
};

type PageStatus = 'loading' | 'unassigned' | 'assigned' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessagingLimit(tier: string): string {
  if (tier === 'TIER_1K') return '1,000 msgs / day';
  if (tier === 'TIER_10K') return '10,000 msgs / day';
  if (tier === 'TIER_100K') return '100,000 msgs / day';
  if (tier === 'UNLIMITED') return 'Unlimited';
  return tier || '—';
}

function qualityColor(rating: string): string {
  if (rating === 'GREEN') return 'green';
  if (rating === 'RED') return 'red';
  return 'yellow';
}

function statusColor(status: string): string {
  if (status === 'ACTIVE' || status === 'Active') return 'green';
  if (status === 'BANNED' || status === 'FLAGGED') return 'red';
  return 'yellow';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    padding: '28px',
    maxWidth: '720px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1e293b',
  },
  pageTitle: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#1e293b' },
  pageSubtitle: { fontSize: '14px', color: '#64748b', marginBottom: '28px' },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '20px',
  },
  badge: (c: string) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: c === 'green' ? '#dcfce7' : c === 'red' ? '#fee2e2' : '#fef9c3',
    color: c === 'green' ? '#15803d' : c === 'red' ? '#b91c1c' : '#a16207',
  }),
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '12px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  label: { fontSize: '13px', color: '#64748b', fontWeight: 500 },
  value: { fontSize: '14px', color: '#1e293b', fontWeight: 600 },
  btnGreen: {
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 22px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnOutline: {
    backgroundColor: '#fff',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  spinner: {
    display: 'inline-block' as const,
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  spinnerDark: {
    display: 'inline-block' as const,
    width: '32px',
    height: '32px',
    border: '3px solid rgba(0,0,0,0.1)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  errorBanner: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#b91c1c',
    fontSize: '13px',
    marginBottom: '16px',
  },
  warnBanner: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#92400e',
    fontSize: '13px',
    marginBottom: '16px',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WHNumberSetup() {
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [numberData, setNumberData] = useState<NumberData | null>(null);
  const [pageError, setPageError] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const workspaceId = localStorage.getItem('workspaceId') ?? '';
  const token = localStorage.getItem('token') ?? '';
  const authHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const fetchStatus = async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/whatsapp/number/status`,
        { headers: authHeaders }
      );
      if (res.status === 404) {
        setPageStatus('unassigned');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPageError((body as { error?: string }).error ?? 'Failed to load number status.');
        setPageStatus('error');
        return;
      }
      const data = (await res.json()) as NumberData;
      setNumberData(data);
      setPageStatus('assigned');
    } catch {
      setPageError('Network error. Please check your connection.');
      setPageStatus('error');
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleOnboard = async () => {
    if (onboarding) return;
    setOnboarding(true);
    setOnboardError('');
    try {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/whatsapp/onboard`,
        { method: 'POST', headers: authHeaders }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOnboardError((body as { error?: string }).error ?? 'Something went wrong. Please try again.');
        return;
      }
      // Re-fetch to get full health data
      await fetchStatus();
    } catch {
      setOnboardError('Network error. Please check your connection.');
    } finally {
      setOnboarding(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (pageStatus === 'loading') {
    return (
      <div style={S.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px' }}>
          <span style={S.spinnerDark} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Page-level error ───────────────────────────────────────────────────────

  if (pageStatus === 'error') {
    return (
      <div style={S.page}>
        <div style={S.pageTitle}>WhatsApp Number Setup</div>
        <div style={S.pageSubtitle}>Manage your dedicated WhatsApp Business number.</div>
        <div style={S.errorBanner}>{pageError}</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.pageTitle}>WhatsApp Number Setup</div>
      <div style={S.pageSubtitle}>Manage your dedicated WhatsApp Business number.</div>

      {/* ── State 1 — No number yet ── */}
      {pageStatus === 'unassigned' && (
        <div style={{ ...S.card, textAlign: 'center', padding: '56px 32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#dcfce7',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.07 3.4 2 2 0 0 1 3.05 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.22 16a2 2 0 0 1 .7.92z"/>
            </svg>
          </div>

          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            Get Your WhatsApp Business Number
          </div>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px', maxWidth: '380px', margin: '0 auto 28px' }}>
            Your number will be assigned instantly from our pre-verified pool. No additional setup required.
          </div>

          {onboardError && (
            <div style={{ ...S.errorBanner, textAlign: 'left', maxWidth: '400px', margin: '0 auto 20px' }}>
              {onboardError}
            </div>
          )}

          <button
            style={{
              ...S.btnGreen,
              opacity: onboarding ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
            disabled={onboarding}
            onClick={handleOnboard}
          >
            {onboarding && <span style={S.spinner} />}
            {onboarding ? 'Assigning your number…' : 'Get My WhatsApp Number'}
          </button>
        </div>
      )}

      {/* ── State 2 — Number assigned ── */}
      {pageStatus === 'assigned' && numberData && (
        <div style={S.card}>
          {/* BANNED banner */}
          {(numberData.status === 'BANNED') && (
            <div style={{ ...S.errorBanner }}>
              This number has been banned by Meta. Please contact support to resolve the issue.
            </div>
          )}

          {/* metaError warning */}
          {numberData.metaError && (
            <div style={S.warnBanner}>
              Live data from Meta is currently unavailable. Showing last known values.
            </div>
          )}

          {/* Header — phone + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.5px' }}>
                {numberData.phoneNumber}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                {numberData.displayName}
              </div>
            </div>
            <span style={S.badge(statusColor(numberData.status))}>
              {numberData.status || 'Unknown'}
            </span>
          </div>

          {/* Detail rows */}
          <div style={{ ...S.row, paddingTop: 0 }}>
            <span style={S.label}>Display Name</span>
            <span style={S.value}>{numberData.displayName || '—'}</span>
          </div>

          <div style={S.row}>
            <span style={S.label}>Quality Rating</span>
            {numberData.qualityRating
              ? <span style={S.badge(qualityColor(numberData.qualityRating))}>{numberData.qualityRating}</span>
              : <span style={S.value}>—</span>
            }
          </div>

          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={S.label}>Messaging Limit</span>
            <span style={S.value}>{formatMessagingLimit(numberData.messagingLimit)}</span>
          </div>

          {/* Refresh button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              style={{
                ...S.btnOutline,
                opacity: refreshing ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing && (
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(0,0,0,0.2)',
                  borderTopColor: '#475569',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              )}
              {refreshing ? 'Refreshing…' : 'Refresh Status'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
