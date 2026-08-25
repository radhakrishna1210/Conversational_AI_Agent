import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { whapi } from '../lib/whapi';
import { RzCard, RzPill, RzSkeleton } from '@/components/rz';

/**
 * Number verification — the KYC a business clears before it can be sold an
 * Indian phone number.
 *
 * This screen exists because Indian numbers cannot be bought on a click. We are
 * a reseller, so the carrier requires a compliance application per end customer
 * — their documents, their entity, reviewed by a human over several days — and
 * it must already be APPROVED before a number can be rented against it.
 *
 * So the page is a pipeline, not a checkout. Everything about the layout serves
 * that: the status rail is the first thing on screen and stays there, the form
 * collapses once it is submitted, and no copy anywhere promises a number
 * quickly. See backend/docs/NUMBER_PURCHASE_MARKETPLACE.md.
 */

/* ── Wire types ─────────────────────────────────────────────────────────── */

type CarrierStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

interface Address {
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface ComplianceRecord {
  useCase: 'PROMOTIONAL' | 'TRANSACTIONAL' | null;
  entityName: string | null;
  legalEntityType: string | null;
  registrationNumber: string | null;
  contactEmail: string | null;
  registeredAddress: Address;
  carrierApplicationStatus: CarrierStatus;
  carrierApplicationRef: string | null;
  carrierRejectionReason: string | null;
  suspended: boolean;
  suspendedReason: string | null;
}

interface ComplianceDoc {
  id: string;
  kind: string;
  fileName: string;
  status: string;
  reviewNote: string | null;
}

interface ComplianceState {
  record: ComplianceRecord;
  documents: ComplianceDoc[];
}

interface CarrierApplication {
  ready: boolean;
  errors: string[];
  warnings: string[];
  status: CarrierStatus;
  reference: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
}

/* ── Static copy ────────────────────────────────────────────────────────── */

const USE_CASES = [
  {
    value: 'TRANSACTIONAL' as const,
    title: 'Service & transactional',
    text: 'Order updates, appointment reminders, delivery calls, support callbacks — anything the customer is already expecting.',
    series: 'Landline series (022, 080, …)',
  },
  {
    value: 'PROMOTIONAL' as const,
    title: 'Promotional',
    text: 'Offers, launches, and marketing outreach. Requires DLT-approved voice templates and explicit consent from every recipient.',
    series: '140 series',
  },
];

/**
 * The registration document is satisfiable two ways and the carrier accepts
 * either — but only one at a time, so this is a choice, not two slots.
 */
const REGISTRATION_KINDS = [
  { kind: 'COI', label: 'Certificate of Incorporation', hint: 'Issued by the MCA' },
  { kind: 'UDYAM', label: 'Udyam registration', hint: 'For MSME-registered businesses' },
];

const STATUS_VIEW: Record<CarrierStatus, {
  tone: 'idle' | 'warn' | 'ok' | 'err';
  label: string;
  headline: string;
  text: string;
}> = {
  NOT_SUBMITTED: {
    tone: 'idle',
    label: 'Not started',
    headline: 'Verify your business to get a number',
    text: 'Indian telecom rules require us to file your business documents with the carrier before it will sell you a number. Fill this in once and we handle the filing.',
  },
  SUBMITTED: {
    tone: 'warn',
    label: 'Under review',
    headline: 'Your documents are with the carrier',
    text: 'A reviewer at the carrier checks these by hand. This usually takes a few business days — we will email you the moment it changes, and nothing here needs your attention until then.',
  },
  APPROVED: {
    tone: 'ok',
    label: 'Approved',
    headline: 'Your business is verified',
    text: 'The carrier has accepted your documents. You can now be allocated a phone number in the series your call type allows.',
  },
  REJECTED: {
    tone: 'err',
    label: 'Needs correction',
    headline: 'The carrier could not accept these documents',
    text: 'Fix what is flagged below and resubmit. Your whole document set is sent again, so re-upload anything you have changed.',
  },
};

/* ── Small pieces ───────────────────────────────────────────────────────── */

function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="rz-field">
      <label className="rz-field-label">{label}</label>
      {children}
      {hint && !error && <div className="rz-field-hint">{hint}</div>}
      {error && <div className="rz-field-error">{error}</div>}
    </div>
  );
}

/** A numbered section marker, so the pipeline reads as ordered steps. */
function StepHead({ n, title, done, children }: {
  n: number; title: string; done?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rz-between" style={{ marginBottom: 14, gap: 12 }}>
      <div className="rz-cluster-sm" style={{ minWidth: 0, gap: 11 }}>
        <span
          style={{
            width: 24, height: 24, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center',
            fontFamily: 'var(--ff-m)', fontSize: 11.5, fontWeight: 600,
            background: done ? 'rgba(14,179,158,0.14)' : 'var(--s2)',
            color: done ? 'var(--cyan-fg)' : 'var(--tx-3)',
            border: `1px solid ${done ? 'rgba(14,179,158,0.32)' : 'var(--line-2)'}`,
          }}
        >
          {done ? '✓' : n}
        </span>
        <span className="rz-title" style={{ minWidth: 0 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

const Banner = ({ tone, children }: { tone: 'err' | 'warn' | 'ok'; children: React.ReactNode }) => {
  const skin = {
    err: { bg: 'rgba(248,113,113,0.08)', bd: 'rgba(248,113,113,0.3)', fg: 'var(--err)' },
    warn: { bg: 'rgba(245,158,11,0.09)', bd: 'rgba(245,158,11,0.28)', fg: 'var(--warn)' },
    ok: { bg: 'rgba(14,179,158,0.07)', bd: 'rgba(14,179,158,0.3)', fg: 'var(--cyan-fg)' },
  }[tone];
  return (
    <div
      className="rz-card"
      style={{ background: skin.bg, borderColor: skin.bd, color: skin.fg, fontSize: 13, padding: '13px 16px', borderRadius: 12 }}
    >
      {children}
    </div>
  );
};

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function NumberVerification() {
  const [state, setState] = useState<ComplianceState | null>(null);
  const [app, setApp] = useState<CarrierApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Draft form values, seeded from the server and edited locally. Kept separate
  // from `state` so a save that fails does not silently discard what was typed.
  const [form, setForm] = useState({
    entityName: '', legalEntityType: '', registrationNumber: '', contactEmail: '',
    addressLine1: '', city: '', state: '', postalCode: '',
  });
  const [dirty, setDirty] = useState(false);

  const [regKind, setRegKind] = useState('COI');
  const regInput = useRef<HTMLInputElement>(null);
  const gstInput = useRef<HTMLInputElement>(null);

  /**
   * Apply a server state.
   *
   * `resetForm` is deliberately opt-in. Every mutation on this page returns the
   * whole compliance state, so a document upload would otherwise overwrite the
   * business form — throwing away whatever the client had typed but not yet
   * saved. Only the initial load and a successful save of the form itself may
   * reset it.
   */
  const seed = useCallback((s: ComplianceState, { resetForm = false } = {}) => {
    setState(s);
    if (resetForm) {
      const a = s.record.registeredAddress ?? {};
      setForm({
        entityName: s.record.entityName ?? '',
        legalEntityType: s.record.legalEntityType ?? '',
        registrationNumber: s.record.registrationNumber ?? '',
        contactEmail: s.record.contactEmail ?? '',
        addressLine1: a.addressLine1 ?? '', city: a.city ?? '',
        state: a.state ?? '', postalCode: a.postalCode ?? '',
      });
      setDirty(false);
    }
    // If a Udyam certificate is already on file, that is the choice they made.
    if (s.documents.some(d => d.kind === 'UDYAM')) setRegKind('UDYAM');
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        whapi.get<ComplianceState>('/compliance'),
        whapi.get<CarrierApplication>('/compliance/carrier-application'),
      ]);
      seed(s, { resetForm: true });
      setApp(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your verification status.');
    } finally {
      setLoading(false);
    }
  }, [seed]);

  useEffect(() => { void load(); }, [load]);

  /** Re-read the preflight after any mutation, so the blockers list stays true. */
  const refreshApp = async () => {
    try { setApp(await whapi.get<CarrierApplication>('/compliance/carrier-application')); } catch { /* non-fatal */ }
  };

  const run = async (
    key: string,
    fn: () => Promise<ComplianceState | void>,
    { resetForm = false } = {},
  ) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const next = await fn();
      if (next) seed(next, { resetForm });
      else await load();
      await refreshApp();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const record = state?.record;
  const status: CarrierStatus = record?.carrierApplicationStatus ?? 'NOT_SUBMITTED';
  const view = STATUS_VIEW[status];
  const locked = status === 'SUBMITTED' || status === 'APPROVED';

  const docFor = (kinds: string[]) => state?.documents.find(d => kinds.includes(d.kind)) ?? null;
  const registrationDoc = docFor(['COI', 'UDYAM']);
  const gstDoc = docFor(['GST']);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setDirty(true);
  };

  /* ── Actions ───────────────────────────────────────────────────────── */

  const saveUseCase = (useCase: 'PROMOTIONAL' | 'TRANSACTIONAL') =>
    run('useCase', () => whapi.put<ComplianceState>('/compliance/use-case', { useCase }));

  const saveBusiness = () => run('business', async () => {
    // Two endpoints because they are two concerns: the entity's *name* also
    // drives DLT header registration, while the rest exists only for the
    // carrier's end_user record. Sequential, not parallel — if the first fails
    // the second should not land and leave the pair half-saved.
    if (form.entityName.trim()) {
      await whapi.put<ComplianceState>('/compliance/use-case', {
        entityName: form.entityName.trim(),
        ...(form.legalEntityType.trim() ? { legalEntityType: form.legalEntityType.trim() } : {}),
      });
    }
    return whapi.put<ComplianceState>('/compliance/entity-details', {
      registrationNumber: form.registrationNumber.trim(),
      contactEmail: form.contactEmail.trim(),
      address: {
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: 'IN',
      },
    });
  }, { resetForm: true });

  const upload = (kind: string, file: File | null | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    void run(`doc:${kind}`, () => whapi.postForm<ComplianceState>('/compliance/documents', fd));
  };

  /**
   * Removing the registration document is what makes the COI/Udyam choice
   * changeable. Uploading only ever replaces the same kind, so without a delete
   * a client who picked the wrong one is stuck with it.
   */
  const removeDoc = (doc: ComplianceDoc) =>
    run(`del:${doc.kind}`, () => whapi.delete<ComplianceState>(`/compliance/documents/${doc.id}`));

  const submit = () => run('submit', async () => {
    const isCorrection = status === 'REJECTED' && Boolean(record?.carrierApplicationRef);
    const res = isCorrection
      ? await whapi.patch<{ warnings?: string[] } & ComplianceState>('/compliance/carrier-application', {})
      : await whapi.post<{ warnings?: string[] } & ComplianceState>('/compliance/carrier-application', {});
    setNotice(
      isCorrection
        ? 'Resubmitted. The carrier will review your corrected documents.'
        : 'Filed with the carrier. We will email you when they decide.',
    );
    return res;
  });

  const checkStatus = () => run('refresh', () =>
    whapi.post<ComplianceState>('/compliance/carrier-application/refresh', {}));

  /* ── Render ────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="rz-page rz-page-pad rz-bleed">
        <div className="rz-wrap"><RzSkeleton rows={4} height={92} /></div>
      </div>
    );
  }

  const businessDone = Boolean(
    record?.entityName && record?.registrationNumber && record?.contactEmail
    && record?.registeredAddress?.addressLine1 && record?.registeredAddress?.city
    && record?.registeredAddress?.state && record?.registeredAddress?.postalCode,
  );
  const docsDone = Boolean(registrationDoc && gstDoc);

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap">
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Phone numbers</div>
            <h1 className="rz-h1">Number verification</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 640 }}>
              Indian regulators require every business that makes commercial calls to be verified with
              the carrier first. This is that check — you fill it in once, and it covers every number
              you take from us afterwards.
            </p>
          </div>
          <div className="rz-head-actions">
            <RzPill tone={view.tone} dot>{view.label}</RzPill>
          </div>
        </div>

        {/* ── Status rail ─────────────────────────────────────────────── */}
        <RzCard style={{ marginBottom: 16 }}>
          <div className="rz-title-lg" style={{ marginBottom: 6 }}>{view.headline}</div>
          <p className="rz-sub" style={{ margin: 0, maxWidth: 660 }}>{view.text}</p>

          {status === 'REJECTED' && record?.carrierRejectionReason && (
            <div style={{ marginTop: 13 }}>
              <Banner tone="err">
                <strong style={{ display: 'block', marginBottom: 3 }}>Reason from the carrier</strong>
                {record.carrierRejectionReason}
              </Banner>
            </div>
          )}

          {record?.suspended && (
            <div style={{ marginTop: 13 }}>
              <Banner tone="err">
                <strong style={{ display: 'block', marginBottom: 3 }}>Calling is stopped on this workspace</strong>
                {record.suspendedReason ?? 'Contact support.'}
              </Banner>
            </div>
          )}

          {status === 'SUBMITTED' && (
            <div className="rz-cluster-sm" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
              <button className="rz-btn rz-btn-secondary rz-btn-sm" disabled={busy === 'refresh'} onClick={checkStatus}>
                {busy === 'refresh' ? 'Checking…' : 'Check for an update'}
              </button>
              {app?.submittedAt && (
                <span className="rz-mono-xs">
                  filed {new Date(app.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          )}

          {status === 'APPROVED' && (
            <div style={{ marginTop: 14 }}>
              {/*
                The honesty requirement. An approved application means the
                carrier will SELL us a number for this business — it does not
                mean the business can dial. The DLT header registration is the
                client's own step on their operator's portal, and we have no API
                into it. Saying "you're ready to call" here would be the single
                most expensive false promise on this screen.
              */}
              <Banner tone="warn">
                <strong style={{ display: 'block', marginBottom: 3 }}>One more step before you can dial</strong>
                Once you have a number, you must register it as a header under your own DLT Principal
                Entity on your operator&rsquo;s portal. Until that clears, calls from it will be blocked —
                by us and by the network.
              </Banner>
            </div>
          )}
        </RzCard>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="err">
              <div className="rz-between" style={{ gap: 12 }}>
                <span>{error}</span>
                <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={() => void load()}>Retry</button>
              </div>
            </Banner>
          </div>
        )}
        {notice && <div style={{ marginBottom: 14 }}><Banner tone="ok">{notice}</Banner></div>}

        {/* Once approved the form is history — nothing on it can be changed
            without refiling, so showing it invites edits that go nowhere. */}
        {status === 'APPROVED' ? (
          <RzCard title="What you filed">
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0,180px) 1fr', gap: '10px 18px', fontSize: 13.5 }}>
              {[
                ['Legal entity', record?.entityName],
                ['Registration no.', record?.registrationNumber],
                ['Call type', record?.useCase === 'PROMOTIONAL' ? 'Promotional' : 'Service & transactional'],
                ['Contact email', record?.contactEmail],
                ['Reference', record?.carrierApplicationRef],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: 'contents' }}>
                  <dt className="rz-sub" style={{ fontSize: 12.5 }}>{k}</dt>
                  <dd style={{ margin: 0, fontFamily: k === 'Reference' ? 'var(--ff-m)' : undefined, wordBreak: 'break-word' }}>
                    {v || '—'}
                  </dd>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: 18 }}>
              <Link className="rz-btn rz-btn-primary" to="/phone_numbers">Go to phone numbers →</Link>
            </div>
          </RzCard>
        ) : (
          <div className="rz-stack">
            {/* ── 1. Call type ──────────────────────────────────────── */}
            <RzCard>
              <StepHead n={1} title="What will you use the number for?" done={Boolean(record?.useCase)} />
              <p className="rz-sub" style={{ margin: '0 0 14px', fontSize: 12.5 }}>
                This decides which number series you can be sold, and the series legally limits what may be
                said on the call. It cannot be changed once a number is live.
              </p>
              <div className="rz-grid-2">
                {USE_CASES.map(u => {
                  const active = record?.useCase === u.value;
                  return (
                    <button
                      key={u.value}
                      type="button"
                      className="rz-card-btn"
                      disabled={locked || busy === 'useCase'}
                      onClick={() => void saveUseCase(u.value)}
                      style={{
                        textAlign: 'left', padding: 15, borderRadius: 12,
                        background: active ? 'rgba(14,179,158,0.07)' : undefined,
                        borderColor: active ? 'rgba(14,179,158,0.4)' : undefined,
                        cursor: locked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div className="rz-between" style={{ marginBottom: 5 }}>
                        <span className="rz-title" style={{ fontSize: 13.5 }}>{u.title}</span>
                        {active && <RzPill tone="ok">Selected</RzPill>}
                      </div>
                      <p className="rz-sub" style={{ margin: '0 0 8px', fontSize: 12 }}>{u.text}</p>
                      <span className="rz-mono-xs">{u.series}</span>
                    </button>
                  );
                })}
              </div>
            </RzCard>

            {/* ── 2. Business details ───────────────────────────────── */}
            <RzCard>
              <StepHead n={2} title="Your registered business" done={businessDone} />
              <p className="rz-sub" style={{ margin: '0 0 16px', fontSize: 12.5 }}>
                Enter these exactly as they appear on your certificates. The carrier compares them
                character by character — even a full stop in the wrong place is a rejection.
              </p>

              <div className="rz-stack">
                <Field
                  label="Legal entity name"
                  hint="Word for word from your Certificate of Incorporation, including punctuation."
                >
                  <input
                    className="rz-input" value={form.entityName} disabled={locked}
                    onChange={set('entityName')} placeholder="Acme Dental Pvt. Ltd."
                  />
                </Field>

                <div className="rz-grid-2">
                  <Field label="CIN or Udyam number" hint="The registration number on the certificate you upload below.">
                    <input
                      className="rz-input" value={form.registrationNumber} disabled={locked}
                      onChange={set('registrationNumber')} placeholder="U72200KA2020PTC123456"
                    />
                  </Field>
                  <Field label="Entity type" hint="Optional. e.g. Private Limited, LLP, Proprietorship.">
                    <input
                      className="rz-input" value={form.legalEntityType} disabled={locked}
                      onChange={set('legalEntityType')} placeholder="Private Limited"
                    />
                  </Field>
                </div>

                <Field label="Contact email" hint="Where the carrier sends questions about this application. Use a mailbox someone reads.">
                  <input
                    className="rz-input" type="email" value={form.contactEmail} disabled={locked}
                    onChange={set('contactEmail')} placeholder="ops@yourcompany.in"
                  />
                </Field>

                <Field label="Registered address">
                  <input
                    className="rz-input" value={form.addressLine1} disabled={locked}
                    onChange={set('addressLine1')} placeholder="Street address"
                  />
                </Field>
                <div className="rz-grid-3">
                  <input className="rz-input" value={form.city} disabled={locked} onChange={set('city')} placeholder="City" />
                  <input className="rz-input" value={form.state} disabled={locked} onChange={set('state')} placeholder="State" />
                  <input className="rz-input" value={form.postalCode} disabled={locked} onChange={set('postalCode')} placeholder="PIN code" />
                </div>

                <div>
                  <button
                    className="rz-btn rz-btn-secondary"
                    disabled={locked || busy === 'business' || !dirty}
                    onClick={() => void saveBusiness()}
                  >
                    {busy === 'business' ? 'Saving…' : dirty ? 'Save details' : 'Saved'}
                  </button>
                </div>
              </div>
            </RzCard>

            {/* ── 3. Documents ──────────────────────────────────────── */}
            <RzCard>
              <StepHead n={3} title="Your documents" done={docsDone} />
              <p className="rz-sub" style={{ margin: '0 0 16px', fontSize: 12.5 }}>
                PDF, JPEG or PNG, up to 5 MB each. Uploading again replaces what is there.
              </p>

              <div className="rz-stack-sm">
                {/* Business registration — one document, two acceptable forms. */}
                <div className="rz-card" style={{ padding: 15, borderRadius: 12 }}>
                  <div className="rz-between" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                    <span className="rz-title" style={{ fontSize: 13.5 }}>Business registration</span>
                    {registrationDoc
                      ? <RzPill tone="ok">{registrationDoc.kind === 'UDYAM' ? 'Udyam' : 'Incorporation'}</RzPill>
                      : <RzPill tone="idle">Required</RzPill>}
                  </div>

                  {!registrationDoc && (
                    <div className="rz-cluster-sm" style={{ marginBottom: 11, gap: 8, flexWrap: 'wrap' }}>
                      {REGISTRATION_KINDS.map(r => (
                        <button
                          key={r.kind} type="button"
                          className={`rz-btn rz-btn-sm ${regKind === r.kind ? 'rz-btn-secondary' : 'rz-btn-ghost'}`}
                          disabled={locked} onClick={() => setRegKind(r.kind)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="rz-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <span className="rz-mono-xs" style={{ minWidth: 0, wordBreak: 'break-all' }}>
                      {registrationDoc?.fileName
                        ?? REGISTRATION_KINDS.find(r => r.kind === regKind)?.hint
                        ?? 'No file yet'}
                    </span>
                    <div className="rz-cluster-sm" style={{ gap: 8 }}>
                      {/* Replace keeps the same kind; Remove is how you switch
                          between a Certificate of Incorporation and Udyam. */}
                      {registrationDoc && (
                        <button
                          className="rz-btn rz-btn-ghost rz-btn-sm"
                          disabled={locked || Boolean(busy)}
                          onClick={() => void removeDoc(registrationDoc)}
                        >
                          {busy === `del:${registrationDoc.kind}` ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                      <button
                        className="rz-btn rz-btn-secondary rz-btn-sm"
                        disabled={locked || busy?.startsWith('doc:')}
                        onClick={() => regInput.current?.click()}
                      >
                        {busy?.startsWith('doc:') && busy !== 'doc:GST' ? 'Uploading…' : registrationDoc ? 'Replace' : 'Upload'}
                      </button>
                    </div>
                  </div>
                  <input
                    ref={regInput} type="file" style={{ display: 'none' }}
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={e => { upload(registrationDoc?.kind ?? regKind, e.target.files?.[0]); e.target.value = ''; }}
                  />
                  {registrationDoc?.reviewNote && (
                    <div className="rz-field-error" style={{ marginTop: 8 }}>{registrationDoc.reviewNote}</div>
                  )}
                </div>

                {/* GST — no alternative. Our own checklist accepts a PAN for tax
                    registration; the carrier does not, so this slot is GST-only
                    and says so rather than letting a PAN through to a rejection. */}
                <div className="rz-card" style={{ padding: 15, borderRadius: 12 }}>
                  <div className="rz-between" style={{ marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                    <span className="rz-title" style={{ fontSize: 13.5 }}>GST registration certificate</span>
                    {gstDoc ? <RzPill tone="ok">Uploaded</RzPill> : <RzPill tone="idle">Required</RzPill>}
                  </div>
                  <div className="rz-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <span className="rz-mono-xs" style={{ minWidth: 0, wordBreak: 'break-all' }}>
                      {gstDoc?.fileName ?? 'Form GST REG-06 — a PAN card will not be accepted'}
                    </span>
                    <button
                      className="rz-btn rz-btn-secondary rz-btn-sm"
                      disabled={locked || busy?.startsWith('doc:')}
                      onClick={() => gstInput.current?.click()}
                    >
                      {busy === 'doc:GST' ? 'Uploading…' : gstDoc ? 'Replace' : 'Upload'}
                    </button>
                  </div>
                  <input
                    ref={gstInput} type="file" style={{ display: 'none' }}
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={e => { upload('GST', e.target.files?.[0]); e.target.value = ''; }}
                  />
                  {gstDoc?.reviewNote && (
                    <div className="rz-field-error" style={{ marginTop: 8 }}>{gstDoc.reviewNote}</div>
                  )}
                </div>
              </div>
            </RzCard>

            {/* ── 4. Submit ─────────────────────────────────────────── */}
            <RzCard>
              <StepHead
                n={4}
                title={status === 'REJECTED' ? 'Resubmit to the carrier' : 'Send to the carrier'}
                done={status === 'SUBMITTED'}
              />

              {app && app.errors.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="rz-label" style={{ marginBottom: 8 }}>STILL NEEDED</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {app.errors.map(e => (
                      <li key={e} className="rz-sub" style={{ fontSize: 12.5 }}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/*
                Advisory, never blocking. These are the shapes that get rejected
                most often, but a client whose certificate genuinely reads
                "Pvt Ltd" must be able to submit "Pvt Ltd".
              */}
              {app && app.warnings.length > 0 && app.errors.length === 0 && (
                <div style={{ marginBottom: 14 }}>
                  <Banner tone="warn">
                    <strong style={{ display: 'block', marginBottom: 5 }}>Worth double-checking first</strong>
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {app.warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                  </Banner>
                </div>
              )}

              <p className="rz-sub" style={{ margin: '0 0 14px', fontSize: 12.5 }}>
                {status === 'REJECTED'
                  ? 'Your full document set is sent again — the carrier replaces it rather than merging, so anything you have not changed still goes up.'
                  : 'We file this with the carrier on your behalf. Review is by hand and usually takes a few business days.'}
              </p>

              <button
                className="rz-btn rz-btn-primary"
                disabled={locked || !app?.ready || busy === 'submit'}
                onClick={() => void submit()}
              >
                {busy === 'submit'
                  ? 'Sending…'
                  : status === 'REJECTED' ? 'Resubmit documents' : 'Submit for verification'}
              </button>
            </RzCard>
          </div>
        )}
      </div>
    </div>
  );
}
