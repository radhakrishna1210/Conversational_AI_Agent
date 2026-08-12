import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell, { AuthField, AuthOAuth } from '@/components/AuthShell';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  // Two-step signup: details → email OTP → account created
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [otp, setOtp] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Server allows 2-80 of anything. Letters-and-spaces-only rejected ordinary
  // names — "R. Krishna", "O'Brien", "Anne-Marie" — and every non-ASCII script,
  // so it is widened to match rather than invent a stricter client-side rule.
  const validateName = (name: string) => {
    const n = name.trim();
    return n.length >= 2 && n.length <= 80 && !/\d/.test(n);
  };
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Must agree with the server (PASSWORD_MIN/MAX_LENGTH = 8/100, no composition
  // rule). The previous regex also demanded upper+lower+digit+one of "@$!%*?&",
  // which the server never enforced — so the form rejected passwords the API
  // would have accepted. Worst of all it rejected browser-generated ones:
  // Chrome suggests things like "Xkq3vnRs7bTz" (no symbol) and "Kmw4-pZtq9Lr"
  // (a hyphen, not in that set), so accepting the password manager's suggestion
  // made signup impossible. Length is the check that carries its weight here;
  // the strength meter below stays as guidance rather than a gate.
  const validatePassword = (password: string) =>
    password.length >= 8 && password.length <= 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!validateName(form.name)) {
      setErrorMsg('Please enter your full name (2-80 characters, no digits).');
      return;
    }
    if (!validateEmail(form.email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!validatePassword(form.password)) {
      setErrorMsg('Password must be between 8 and 100 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('submitting');
    // REAL signup: request an email OTP. (This page previously faked success
    // with a setTimeout and never contacted the backend — no account was ever
    // created.)
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, email: form.email, password: form.password, workspaceName: `${form.name}'s Workspace` }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Signup failed (${res.status})`);
        if (data.unverified) {
          // Server created the account directly (SMTP not configured) —
          // no OTP step needed.
          setStatus('success');
          setTimeout(() => navigate('/login'), 1400);
          return;
        }
        setStep('otp');
        setStatus('idle');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Signup failed');
        setStatus('error');
      }
    })();
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!otp.trim()) { setErrorMsg('Enter the 6-digit code from your email.'); return; }
    setStatus('submitting');
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, otp: otp.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Verification failed (${res.status})`);
        setStatus('success');
        setTimeout(() => navigate('/login'), 1200);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Verification failed');
        setStatus('error');
      }
    })();
  };

  /*
    Password strength, as four segments rather than a word. Length is the only
    signal the meter uses, which is why it is deliberately unlabelled — calling
    a 12-character password "strong" would overstate what is being measured.
  */
  const strength = form.password.length >= 12 ? 4 : form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : 1;
  const strengthColor = strength >= 3 ? 'var(--lime)' : strength === 2 ? 'var(--warn)' : 'var(--err)';

  const banner = (
    <>
      {errorMsg && (
        <div
          style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 10, padding: '11px 13px', color: 'var(--err)', fontSize: 13, marginBottom: 14,
          }}
        >
          {errorMsg}
        </div>
      )}
      {status === 'success' && (
        <div
          className="rz-enter"
          style={{
            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 10, padding: '11px 13px', color: 'var(--lime)', fontSize: 13, marginBottom: 14,
          }}
        >
          Account created — taking you to sign in…
        </div>
      )}
    </>
  );

  if (step === 'otp') {
    return (
      <AuthShell
        kicker="Verify"
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${form.email}. Enter it to finish creating your account.`}
      >
        {banner}
        <form onSubmit={handleVerifyOtp} className="rz-stack" style={{ gap: 14 }}>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            aria-label="Verification code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="rz-input"
            style={{ fontFamily: 'var(--ff-m)', fontSize: 22, letterSpacing: 8, textAlign: 'center', padding: 14 }}
          />
          <button type="submit" className="rz-btn rz-btn-primary rz-btn-block" style={{ padding: 13, fontSize: 15 }} disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Verifying…' : 'Verify & create account'}
          </button>
          <button
            type="button"
            className="rz-btn rz-btn-ghost rz-btn-block"
            onClick={() => { setStep('details'); setErrorMsg(''); setStatus('idle'); }}
          >
            ← Back / change email
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker="Get started"
      title="Create your account"
      subtitle="Build your first voice agent in minutes — no card required."
      footer={
        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13.5, color: 'var(--tx-2)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--cyan-fg)', fontWeight: 600 }}>Sign in</Link>
        </div>
      }
    >
      <AuthOAuth label="Continue with Google" onClick={() => { window.location.href = '/api/v1/auth/google'; }} />

      {banner}

      <form onSubmit={handleSubmit} className="rz-stack" style={{ gap: 14 }}>
        <AuthField label="Full name">
          <input
            type="text" name="name" className="rz-input" placeholder="Dan Alvarez"
            value={form.name} onChange={handleChange} required autoComplete="name"
          />
        </AuthField>

        <AuthField label="Work email">
          <input
            type="email" name="email" className="rz-input" placeholder="you@company.com"
            value={form.email} onChange={handleChange} required autoComplete="email"
          />
        </AuthField>

        <AuthField label="Password">
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'} name="password" className="rz-input"
              placeholder="At least 8 characters" value={form.password} onChange={handleChange}
              required autoComplete="new-password" style={{ paddingRight: 46 }}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', padding: 0,
                display: 'grid', placeItems: 'center',
              }}
            >
              {showPass ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {form.password.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 4 }} aria-hidden>
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: i <= strength ? strengthColor : 'var(--s3)',
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
          )}
        </AuthField>

        <AuthField label="Confirm password">
          <input
            type={showPass ? 'text' : 'password'} name="confirm" className="rz-input"
            placeholder="Re-enter your password" value={form.confirm} onChange={handleChange}
            required autoComplete="new-password"
          />
        </AuthField>

        <button
          type="submit"
          className="rz-btn rz-btn-primary rz-btn-block"
          style={{ marginTop: 6, padding: 13, fontSize: 15 }}
          disabled={status === 'submitting' || status === 'success'}
        >
          {status === 'submitting' ? (
            <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Creating account…</>
          ) : status === 'success' ? 'Done' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
