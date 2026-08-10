import { useState } from 'react';
import { safeSet, decodeJwtPayload, isAdminRole } from '@/lib/authStorage';
import { Link } from 'react-router-dom';
import AuthShell, { AuthField, AuthOAuth } from '@/components/AuthShell';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.email || !form.password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setStatus('submitting');

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Invalid email or password.');
        setStatus('error');
        return;
      }

      // Persist via authStorage — writes to localStorage with automatic
      // sessionStorage fallback (Safari/incognito), matching how the rest of
      // the app now reads auth state.
      safeSet('token', data.accessToken);
      safeSet('refreshToken', data.refreshToken);
      safeSet('userName', data.user.name);
      safeSet('userEmail', data.user.email);
      if (data.workspace?.id) safeSet('workspaceId', data.workspace.id);

      setStatus('success');
      // A Superadmin's home is the console, not a tenant dashboard. Read the
      // role off the freshly-issued token rather than stored state, which is
      // still the previous session's at this point.
      const role = decodeJwtPayload(data.accessToken)?.role;
      const destination = isAdminRole(role) ? '/admin' : '/dashboard';
      setTimeout(() => { window.location.href = destination; }, 1200);
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setStatus('error');
    }
  };

  return (
    <AuthShell
      kicker="Welcome back"
      title="Sign in"
      subtitle="Pick up where your agents left off."
      footer={
        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13.5, color: 'var(--tx-2)' }}>
          New to Spandan?{' '}
          <Link to="/signup" style={{ color: 'var(--cyan-fg)', fontWeight: 600 }}>Create an account</Link>
        </div>
      }
    >
      <AuthOAuth label="Continue with Google" onClick={() => { window.location.href = '/api/v1/auth/google'; }} />

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
          Signed in — taking you to your dashboard…
        </div>
      )}

      <form onSubmit={handleSubmit} className="rz-stack" style={{ gap: 14 }}>
        <AuthField label="Work email">
          <input
            type="email" name="email" className="rz-input" placeholder="you@company.com"
            value={form.email} onChange={handleChange} required autoComplete="email"
          />
        </AuthField>

        <AuthField
          label="Password"
          action={
            <Link to="/forgot-password" style={{ fontSize: 11.5, color: 'var(--cyan-fg)' }}>
              Forgot?
            </Link>
          }
        >
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'} name="password" className="rz-input"
              placeholder="••••••••••" value={form.password} onChange={handleChange}
              required autoComplete="current-password" style={{ paddingRight: 46 }}
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
        </AuthField>

        <button
          type="submit"
          className="rz-btn rz-btn-primary rz-btn-block"
          style={{ marginTop: 6, padding: 13, fontSize: 15 }}
          disabled={status === 'submitting' || status === 'success'}
        >
          {status === 'submitting' ? (
            <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Signing in…</>
          ) : status === 'success' ? 'Signed in' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
