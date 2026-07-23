import { useState } from 'react';
import { safeSet } from '@/lib/authStorage';
import { Link } from "react-router-dom";

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      setTimeout(() => window.location.href = "/dashboard", 1500);
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setStatus('error');
    }
  };

  return (
    <div className="login-page">

      {/* ===== Mobile Top Navbar (visible only on mobile) ===== */}
      <div className="login-mobile-navbar">
        <Link to="/" className="login-logo-link">
          <div className="login-logo-icon">C</div>
          <span className="login-logo-text">Conversational <span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>AI</span> Agent</span>
        </Link>
        <button
          className="login-hamburger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="login-hamburger-line" />
          <span className="login-hamburger-line" />
          <span className="login-hamburger-line" />
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="login-mobile-menu">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}>Home</Link>
          <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>Sign Up</Link>
        </div>
      )}

      {/* ===== Left Panel — Branding (desktop only) ===== */}
      <div className="login-left-panel">
        {/* Background glow effects */}
        <div className="login-glow login-glow--tl" />
        <div className="login-glow login-glow--br" />

        {/* Logo */}
        <Link to="/" className="login-logo-link">
          <div className="login-logo-icon">C</div>
          <span className="login-logo-text">Conversational <span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>AI</span> Agent</span>
        </Link>

        {/* Quote / Welcome back */}
        <div>
          <h2 className="login-welcome-heading">
            Welcome back 👋
          </h2>
          <p className="login-welcome-subtext">
            Sign in to manage your voice AI assistants, monitor call logs, and scale your operations.
          </p>

          {[
            { icon: '📊', label: 'Real-time analytics & call logs' },
            { icon: '🤖', label: 'Manage all your AI agents' },
            { icon: '🔌', label: 'Access integrations & API keys' },
            { icon: '💳', label: 'Track usage & billing' },
          ].map((f) => (
            <div key={f.label} className="login-feature-row">
              <span style={{ fontSize: '18px' }}>{f.icon}</span>
              <span className="login-feature-label">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div className="login-social-proof login-social-proof--desktop">
          <p className="login-social-proof-label">Trusted by teams at</p>
          <div className="login-badges">
            {['OpenAI', 'Salesforce', 'Twilio', 'HubSpot'].map(b => (
              <span key={b} className="login-badge">{b}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Right Panel — Form ===== */}
      <div className="login-right-panel">
        <div className="login-form-container">

          <div className="login-heading-block">
            <h1 className="login-form-heading">
              <span className="login-heading-desktop">Sign in to your account</span>
              <span className="login-heading-mobile">Login</span>
            </h1>
            <p className="login-form-subtext login-subtext-desktop">
              Don't have an account?{' '}
              <Link to="/signup" className="login-link-teal">Create one free →</Link>
            </p>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            className="login-google-btn"
            onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
            onMouseOut={e => (e.currentTarget.style.background = '')}
            onClick={() => { window.location.href = '/api/v1/auth/google'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="login-divider">
            <div className="login-divider-line" />
            <span className="login-divider-text">
              <span className="login-divider-desktop">or sign in with email</span>
              <span className="login-divider-mobile">OR</span>
            </span>
            <div className="login-divider-line" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">

            {errorMsg && (
              <div className="login-alert login-alert--error">
                ⚠️ {errorMsg}
              </div>
            )}

            {status === 'success' && (
              <div className="login-alert login-alert--success">
                ✓ Login successful! Redirecting...
              </div>
            )}

            <div>
              <label className="login-label">Email</label>
              <input
                type="email"
                name="email"
                className="form-input login-input"
                placeholder="john@company.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <div className="login-password-header">
                <label className="login-label" style={{ marginBottom: 0 }}>Password</label>
                <Link to="/forgot-password" className="login-forgot-link">Forgot password?</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  className="form-input login-input"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  className="login-toggle-pass"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary login-submit-btn"
              disabled={status === 'submitting' || status === 'success'}
              style={{ background: status === 'success' ? '#22c55e' : undefined, color: 'var(--bg-primary)' }}
            >
              {(status === 'idle' || status === 'error') && (
                <>
                  <span className="login-btn-text-desktop">Sign In →</span>
                  <span className="login-btn-text-mobile">Login</span>
                </>
              )}
              {status === 'submitting' && (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="login-spinner" />
                  Signing in...
                </span>
              )}
              {status === 'success' && '✓ Done!'}
            </button>
          </form>

          {/* "Don't have an account?" — visible on mobile below the form */}
          <p className="login-form-subtext login-subtext-mobile">
            Don't have an account?{' '}
            <Link to="/signup" className="login-link-teal">Create Account</Link>
          </p>

          {/* Mobile trust badges (shown below form on mobile) */}
          <div className="login-social-proof login-social-proof--mobile">
            <p className="login-trust-heading">TRUSTED BY LEADING COMPANIES</p>
            <div className="login-badges login-badges--mobile">
              {['OpenAI', 'Salesforce', 'Twilio', 'HubSpot'].map(b => (
                <span key={b} className="login-badge">{b}</span>
              ))}
            </div>
            <p className="login-trust-more">and 100+ more</p>
          </div>

          {/* Mobile Footer */}
          <div className="login-mobile-footer">
            <a href="#" className="login-footer-link">Terms</a>
            <span className="login-footer-sep">|</span>
            <a href="#" className="login-footer-link">Privacy Policy</a>
          </div>

        </div>
      </div>

      <style>{`
        /* ===== Login Page Responsive Styles ===== */

        @keyframes spin { to { transform: rotate(360deg); } }

        .login-page {
          min-height: 100vh;
          display: flex;
          background: var(--bg-primary);
        }

        /* ===== Mobile Navbar ===== */
        .login-mobile-navbar {
          display: none; /* Hidden on desktop */
        }

        .login-hamburger {
          display: flex;
          flex-direction: column;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
        }
        .login-hamburger-line {
          display: block;
          width: 22px;
          height: 2px;
          background: var(--text-primary);
          border-radius: 2px;
          transition: all 0.3s;
        }

        .login-mobile-menu {
          display: none; /* Hidden on desktop */
        }

        /* --- Left Panel --- */
        .login-left-panel {
          width: 45%;
          background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          position: relative;
          overflow: hidden;
        }

        .login-glow {
          position: absolute;
          pointer-events: none;
          border-radius: 50%;
        }
        .login-glow--tl {
          top: -80px; left: -80px; width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(0,212,200,0.05) 0%, transparent 70%);
        }
        .login-glow--br {
          bottom: -100px; right: -60px; width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(99,102,241,0.03) 0%, transparent 70%);
        }

        /* Logo */
        .login-logo-link {
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .login-logo-icon {
          width: 40px; height: 40px;
          background: var(--teal);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 18px;
          color: var(--bg-primary);
          flex-shrink: 0;
        }
        .login-logo-text {
          font-weight: 800; font-size: 18px;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        /* Welcome Section */
        .login-welcome-heading {
          font-size: 28px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.3;
          margin-bottom: 16px;
        }
        .login-welcome-subtext {
          color: var(--text-secondary);
          font-size: 16px; line-height: 1.6;
          margin-bottom: 40px;
        }

        .login-feature-row {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .login-feature-label {
          color: var(--text-secondary); font-size: 14px;
        }

        /* Social Proof */
        .login-social-proof {
          border-top: 1px solid var(--border);
          padding-top: 24px;
        }
        .login-social-proof-label {
          color: var(--text-secondary); opacity: 0.7;
          font-size: 13px; margin-bottom: 12px;
        }
        .login-badges {
          display: flex; gap: 16px; flex-wrap: wrap;
        }
        .login-badge {
          background: var(--bg-card);
          border: 1px solid var(--border);
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }

        /* Desktop-only social proof */
        .login-social-proof--desktop {
          display: block;
        }
        /* Mobile-only social proof */
        .login-social-proof--mobile {
          display: none;
          border-top: none;
          text-align: center;
          padding-top: 0;
          margin-top: 40px;
        }
        .login-trust-heading {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          color: var(--text-secondary);
          opacity: 0.6;
          margin-bottom: 16px;
          text-transform: uppercase;
        }
        .login-badges--mobile {
          justify-content: center;
        }
        .login-trust-more {
          color: var(--text-secondary);
          opacity: 0.5;
          font-size: 12px;
          margin-top: 12px;
        }

        /* --- Right Panel --- */
        .login-right-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
        }
        .login-form-container {
          width: 100%;
          max-width: 400px;
        }

        .login-heading-block {
          margin-bottom: 32px;
        }

        .login-form-heading {
          font-size: 26px; font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.5px;
          margin-bottom: 8px;
        }
        .login-heading-mobile { display: none; }
        .login-heading-desktop { display: inline; }

        .login-form-subtext {
          color: var(--text-secondary); font-size: 14px;
        }
        .login-link-teal {
          color: var(--teal); font-weight: 600; text-decoration: none;
        }
        .login-link-teal:hover {
          text-decoration: underline;
        }
        .login-subtext-mobile {
          display: none;
        }

        /* Google Button */
        .login-google-btn {
          width: 100%;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
          padding: 11px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px; font-weight: 600;
          cursor: pointer;
          margin-bottom: 24px;
          transition: background 0.2s;
        }

        /* Divider */
        .login-divider {
          display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
        }
        .login-divider-line {
          flex: 1; height: 1px; background: var(--border);
        }
        .login-divider-text {
          color: var(--text-secondary); opacity: 0.8;
          font-size: 12px; font-weight: 500;
          white-space: nowrap;
        }
        .login-divider-mobile { display: none; }
        .login-divider-desktop { display: inline; }

        /* Form */
        .login-form {
          display: flex; flex-direction: column; gap: 16px;
        }
        .login-label {
          display: block; font-size: 13px; font-weight: 600;
          color: var(--text-primary); margin-bottom: 8px;
        }
        .login-input {
          width: 100%;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          box-sizing: border-box;
        }

        .login-password-header {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
        }
        .login-forgot-link {
          font-size: 12px; color: var(--teal); text-decoration: none;
        }
        .login-toggle-pass {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          color: var(--text-secondary);
          cursor: pointer; font-size: 16px; padding: 0;
        }

        .login-submit-btn {
          width: 100%;
          padding: 13px;
          font-size: 15px;
          font-weight: 700;
        }
        .login-btn-text-mobile { display: none; }
        .login-btn-text-desktop { display: inline; }

        .login-spinner {
          display: inline-block;
          width: 14px; height: 14px;
          border: 2px solid rgba(0,0,0,0.3);
          border-top-color: #0a0a0a;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .login-alert {
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 13px;
        }
        .login-alert--error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #ef4444;
        }
        .login-alert--success {
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.3);
          color: #22c55e;
        }

        /* Mobile Footer — hidden on desktop */
        .login-mobile-footer {
          display: none;
        }
        .login-footer-link {
          color: var(--text-secondary);
          opacity: 0.6;
          text-decoration: none;
          font-size: 13px;
          transition: opacity 0.2s;
        }
        .login-footer-link:hover {
          opacity: 1;
        }
        .login-footer-sep {
          color: var(--text-secondary);
          opacity: 0.3;
          margin: 0 8px;
        }

        /* ===== RESPONSIVE BREAKPOINTS ===== */

        /* Tablet landscape / small desktop */
        @media (max-width: 1024px) {
          .login-left-panel {
            width: 40%;
            padding: 36px;
          }
          .login-welcome-heading {
            font-size: 24px;
          }
          .login-welcome-subtext {
            font-size: 14px;
            margin-bottom: 28px;
          }
          .login-right-panel {
            padding: 36px 32px;
          }
        }

        /* Tablet portrait & Mobile */
        @media (max-width: 768px) {
          .login-page {
            flex-direction: column;
            min-height: 100vh;
          }

          /* Show the mobile navbar */
          .login-mobile-navbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
          }

          .login-mobile-menu {
            display: flex;
            flex-direction: column;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 8px 20px;
            gap: 0;
          }
          .login-mobile-menu a {
            color: var(--text-primary);
            text-decoration: none;
            padding: 12px 0;
            font-size: 14px;
            font-weight: 500;
            border-bottom: 1px solid var(--border);
          }
          .login-mobile-menu a:last-child {
            border-bottom: none;
          }

          /* Hide the left branding panel */
          .login-left-panel {
            display: none;
          }

          /* Adjust right panel */
          .login-right-panel {
            padding: 24px 20px 32px;
            min-height: auto;
            flex: 1;
            align-items: center;
            justify-content: flex-start;
          }

          .login-form-container {
            max-width: 400px;
            width: 100%;
            margin: 0 auto;
          }

          /* Switch headings */
          .login-heading-desktop { display: none; }
          .login-heading-mobile { display: inline; }

          .login-form-heading {
            font-size: 24px;
            margin-bottom: 4px;
            text-align: left;
          }

          /* Hide desktop subtext, show mobile version */
          .login-subtext-desktop { display: none; }
          .login-subtext-mobile {
            display: block;
            text-align: center;
            margin-top: 14px;
          }

          .login-heading-block {
            margin-bottom: 16px;
            text-align: left;
          }

          /* Switch divider text */
          .login-divider-desktop { display: none; }
          .login-divider-mobile { display: inline; }
          .login-divider-text {
            font-size: 13px;
            font-weight: 600;
            opacity: 0.6;
          }

          /* Switch button text */
          .login-btn-text-desktop { display: none; }
          .login-btn-text-mobile { display: inline; }

          .login-submit-btn {
            padding: 14px;
            font-size: 16px;
            border-radius: 10px;
          }

          .login-form {
            gap: 12px;
          }

          .login-divider {
            margin-bottom: 16px;
          }

          .login-google-btn {
            border-radius: 10px;
            padding: 12px 16px;
            margin-bottom: 16px;
            background: var(--bg-card);
          }

          /* Show mobile trust section */
          .login-social-proof--desktop { display: none; }
          .login-social-proof--mobile {
            display: block;
            margin-top: 28px;
          }

          /* Show mobile footer — pinned to bottom */
          .login-mobile-footer {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: auto;
            padding-top: 32px;
            padding-bottom: 16px;
          }

          .login-form-container {
            display: flex;
            flex-direction: column;
            min-height: calc(100vh - 60px);
          }
        }

        /* Small Mobile */
        @media (max-width: 480px) {
          .login-mobile-navbar {
            padding: 14px 16px;
          }

          .login-right-panel {
            padding: 20px 16px 24px;
          }

          .login-form-container {
            max-width: 100%;
          }

          .login-form-heading {
            font-size: 22px;
          }

          .login-google-btn {
            font-size: 13px;
          }

          .login-logo-icon {
            width: 34px; height: 34px; font-size: 15px;
          }
          .login-logo-text {
            font-size: 16px;
          }

          .login-badge {
            padding: 3px 10px;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
