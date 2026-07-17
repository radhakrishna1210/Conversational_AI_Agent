import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Two-step password reset backed by /auth/forgot-password + /auth/reset-password.
// Handles the Google-only-account case (backend signals googleOnly: true).
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg({ kind: 'error', text: 'Enter a valid email address.' }); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.googleOnly) {
        setMsg({ kind: 'info', text: 'This account uses Google Sign-In — use "Continue with Google" on the login page instead.' });
      } else {
        setMsg({ kind: 'info', text: data.message || 'If an account exists, a code has been sent.' });
        setStep('reset');
      }
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Request failed' });
    } finally { setBusy(false); }
  };

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
      setMsg({ kind: 'success', text: 'Password updated — all old sessions were signed out. Redirecting to login…' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Reset failed' });
    } finally { setBusy(false); }
  };

  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{ padding: '13px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary, #fff)', fontSize: 14, width: '100%', ...props.style }} />
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, border: '1px solid var(--border)', borderRadius: 14, padding: 32, background: 'var(--bg-secondary, rgba(255,255,255,0.02))' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: 'var(--text-primary, #fff)' }}>Reset your password</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 22 }}>
          {step === 'request'
            ? 'Enter your account email and we’ll send you a 6-digit reset code.'
            : `Enter the code we sent to ${email} and choose a new password.`}
        </p>

        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
            background: msg.kind === 'error' ? 'rgba(239,68,68,0.08)' : msg.kind === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(0,212,200,0.06)',
            border: `1px solid ${msg.kind === 'error' ? 'rgba(239,68,68,0.35)' : msg.kind === 'success' ? 'rgba(34,197,94,0.35)' : 'rgba(0,212,200,0.3)'}`,
            color: msg.kind === 'error' ? '#fca5a5' : msg.kind === 'success' ? '#4ade80' : 'var(--teal, #2dd4bf)',
          }}>{msg.text}</div>
        )}

        {step === 'request' ? (
          <form onSubmit={requestCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {input({ type: 'email', placeholder: 'you@company.com', value: email, onChange: (e) => setEmail((e.target as HTMLInputElement).value), autoFocus: true })}
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: 12 }}>
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        ) : (
          <form onSubmit={doReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {input({ inputMode: 'numeric', maxLength: 6, placeholder: '6-digit code', value: otp, onChange: (e) => setOtp((e.target as HTMLInputElement).value.replace(/\D/g, '')), autoFocus: true, style: { textAlign: 'center', letterSpacing: 6, fontSize: 18 } })}
            {input({ type: 'password', placeholder: 'New password (min 8 chars)', value: newPassword, onChange: (e) => setNewPassword((e.target as HTMLInputElement).value) })}
            {input({ type: 'password', placeholder: 'Confirm new password', value: confirm, onChange: (e) => setConfirm((e.target as HTMLInputElement).value) })}
            <button type="submit" disabled={busy} className="btn btn-primary" style={{ padding: 12 }}>
              {busy ? 'Updating…' : 'Set new password'}
            </button>
            <button type="button" onClick={() => { setStep('request'); setMsg(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
              ← Use a different email / resend code
            </button>
          </form>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13 }}>
          <Link to="/login" style={{ color: 'var(--teal, #2dd4bf)' }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
