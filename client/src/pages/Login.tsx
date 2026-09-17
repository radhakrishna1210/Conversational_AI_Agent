import { useEffect, useState } from 'react';
import { safeSet, setTokens, decodeJwtPayload, isAdminRole } from '@/lib/authStorage';
import { peekSignOutReason, clearSignOutReason } from '@/lib/authFetch';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell, { AuthField, AuthOAuth } from '@/components/AuthShell';

/**
 * Why Google sign-in sent the user back here (`/login?error=<code>`, set by the
 * backend's Google callback). Without these the page reloaded with no message
 * and a refused sign-in looked like nothing had happened.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  account_suspended: 'This account has been suspended. Contact support.',
  email_unverified: "Google hasn't verified this email address.",
  no_email: "Google didn't share an email address.",
  google_denied: 'Google sign-in was cancelled.',
};
const SIGN_IN_ERROR_FALLBACK = "Google sign-in didn't complete. Please try again.";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [showPass, setShowPass] = useState(false);
  // Set when the account exists but has no password yet (created with Google).
  // Holds the server's explanation; the panel offers both ways in.
  const [noPassword, setNoPassword] = useState<{ message: string; hasGoogle: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState(() => {
    const code = searchParams.get('error');
    if (code) return SIGN_IN_ERRORS[code] ?? SIGN_IN_ERROR_FALLBACK;
    // A session the server refused to refresh (e.g. a suspended account).
    // Peeked here and cleared in an effect: StrictMode runs this initializer
    // twice, and a destructive read would hand the second run nothing.
    return peekSignOutReason();
  });

  useEffect(() => { clearSignOutReason(); }, []);

  // Scrub ?error= once read, so a reload or a shared link doesn't repeat it.
  useEffect(() => {
    if (!searchParams.has('error')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (e.target.name === 'email') setNoPassword(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoPassword(null);

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

      // A refusal body may not be JSON (a proxy error page); that is still a
      // refusal, not a network failure.
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // No password on this account yet — not a wrong password. Offer Google
        // and an emailed code to set one, rather than "invalid credentials".
        if (data.code === 'PASSWORD_NOT_SET') {
          setNoPassword({ message: data.error, hasGoogle: Boolean(data.hasGoogle) });
          setStatus('idle');
          return;
        }
        // Show the server's own reason — a suspended account (403) must not
        // read as a mistyped password.
        setErrorMsg(
          data.error || data.message
          || (res.status === 403 ? "This account can't sign in. Contact support." : 'Invalid email or password.'),
        );
        setStatus('error');
        return;
      }

      // Persist via authStorage — writes to localStorage with automatic
      // sessionStorage fallback (Safari/incognito), matching how the rest of
      // the app now reads auth state.
      // setTokens also caches the role from the new token, so nothing keeps
      // routing by the previous session's role.
      setTokens(data.accessToken, data.refreshToken);
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

      {noPassword && (
        <div
          className="rz-enter"
          style={{
            background: 'rgba(14,179,158,0.07)', border: '1px solid rgba(14,179,158,0.26)',
            borderRadius: 10, padding: '11px 13px', color: 'var(--cyan-fg)', fontSize: 13, marginBottom: 14, lineHeight: 1.5,
          }}
        >
          {noPassword.message}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {noPassword.hasGoogle && (
              <button
                type="button" className="rz-btn rz-btn-secondary rz-btn-sm"
                onClick={() => { window.location.href = '/api/v1/auth/google'; }}
              >
                Continue with Google
              </button>
            )}
            <button
              type="button" className="rz-btn rz-btn-ghost rz-btn-sm"
              // Router state, not the URL: the address stays out of history and logs.
              onClick={() => navigate('/forgot-password', { state: { email: form.email, sendCode: true } })}
            >
              Email me a code to set a password
            </button>
          </div>
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
