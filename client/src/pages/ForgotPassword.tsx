import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell, { AuthField } from '@/components/AuthShell';

// Two-step password reset backed by /auth/forgot-password + /auth/reset-password.
// The same flow SETS the first password on an account created with Google: the
// emailed code proves mailbox ownership either way. The sign-in page hands over
// `{ email, sendCode: true }` in router state when it finds such an account.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  // Read once: the state is cleared below, and the page must keep its title.
  const [handoff] = useState(() => (location.state ?? {}) as { email?: string; sendCode?: boolean });
  const settingFirst = Boolean(handoff.sendCode);
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(handoff.email ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (address: string) => {
    setMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setMsg({ kind: 'error', text: 'Enter a valid email address.' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: address }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setMsg({ kind: 'info', text: data.message || 'If an account exists, a code has been sent.' });
      setStep('reset');
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Request failed' });
    } finally { setBusy(false); }
  };

  const requestCode = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCode(email);
  };

  // Arriving from the sign-in page's "Email me a code": send it straight away.
  // The ref keeps StrictMode's second effect run from mailing a second code,
  // and the state is cleared so a reload doesn't send another.
  const handoffSent = useRef(false);
  useEffect(() => {
    if (handoffSent.current || !handoff.sendCode || !handoff.email) return;
    handoffSent.current = true;
    void sendCode(handoff.email);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 8) { setMsg({ kind: 'error', text: 'New password must be at least 8 characters.' }); return; }
    if (newPassword !== confirm) { setMsg({ kind: 'error', text: 'Passwords do not match.' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otp.trim(), newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Reset failed (${res.status})`);
      setMsg({ kind: 'success', text: 'Password saved — all old sessions were signed out. Redirecting to sign in…' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Reset failed' });
    } finally { setBusy(false); }
  };

  // Each kind maps to one state accent, the same three used everywhere else.
  const tone = {
    error:   { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)',  color: 'var(--err)' },
    success: { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  color: 'var(--lime)' },
    info:    { bg: 'rgba(14,179,158,0.07)',  border: 'rgba(14,179,158,0.26)',  color: 'var(--cyan-fg)' },
  } as const;

  return (
    <AuthShell
      kicker={settingFirst ? 'Password' : 'Reset'}
      title={settingFirst ? 'Set a password' : 'Reset your password'}
      subtitle={
        step === 'request'
          ? 'Enter your account email and we’ll send a 6-digit code. Accounts created with Google can set a password this way too.'
          : `Enter the code we sent to ${email} and choose a password.`
      }
      footer={
        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13.5, color: 'var(--tx-2)' }}>
          Remembered it?{' '}
          <Link to="/login" style={{ color: 'var(--cyan-fg)', fontWeight: 600 }}>Back to sign in</Link>
        </div>
      }
    >
      {msg && (
        <div
          className="rz-enter"
          style={{
            padding: '11px 13px', borderRadius: 10, fontSize: 13, marginBottom: 14, lineHeight: 1.5,
            background: tone[msg.kind].bg,
            border: `1px solid ${tone[msg.kind].border}`,
            color: tone[msg.kind].color,
          }}
        >
          {msg.text}
        </div>
      )}

      {step === 'request' ? (
        <form onSubmit={requestCode} className="rz-stack" style={{ gap: 14 }}>
          <AuthField label="Work email">
            <input
              type="email" className="rz-input" placeholder="you@company.com" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            />
          </AuthField>
          <button type="submit" className="rz-btn rz-btn-primary rz-btn-block" style={{ padding: 13, fontSize: 15 }} disabled={busy}>
            {busy ? <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Sending…</> : 'Send reset code'}
          </button>
        </form>
      ) : (
        <form onSubmit={doReset} className="rz-stack" style={{ gap: 14 }}>
          <AuthField label="Reset code">
            <input
              inputMode="numeric" maxLength={6} className="rz-input" placeholder="123456" autoFocus
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              style={{ fontFamily: 'var(--ff-m)', textAlign: 'center', letterSpacing: 8, fontSize: 20, padding: 13 }}
            />
          </AuthField>
          <AuthField label="New password">
            <input
              type="password" className="rz-input" placeholder="At least 8 characters"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
            />
          </AuthField>
          <AuthField label="Confirm password">
            <input
              type="password" className="rz-input" placeholder="Re-enter the new password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            />
          </AuthField>
          <button type="submit" className="rz-btn rz-btn-primary rz-btn-block" style={{ padding: 13, fontSize: 15 }} disabled={busy}>
            {busy ? <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Updating…</> : 'Set new password'}
          </button>
          <button
            type="button"
            className="rz-btn rz-btn-ghost rz-btn-block"
            onClick={() => { setStep('request'); setMsg(null); }}
          >
            ← Use a different email / resend code
          </button>
        </form>
      )}
    </AuthShell>
  );
}
