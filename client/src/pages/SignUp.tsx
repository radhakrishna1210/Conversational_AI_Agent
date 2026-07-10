import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setStorageItem } from '../lib/storage';

// Flow stages
type Stage = 'form' | 'otp' | 'success';

export default function SignUp() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [stage, setStage]       = useState<Stage>('form');
  const [otp, setOtp]           = useState('');
  const [otpToken, setOtpToken] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');
  const [showPass, setShowPass]     = useState(false);

  // ── Validators ────────────────────────────────────────────────────────────
  const validateName     = (v: string) => /^[A-Za-z ]{2,50}$/.test(v.trim());
  const validateEmail    = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePassword = (v: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(v);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  // ── Step 1: Validate form → Send OTP ─────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!validateName(form.name)) {
      setErrorMsg('Full name should contain only letters and spaces (2–50 chars).');
      return;
    }
    if (!validateEmail(form.email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!validatePassword(form.password)) {
      setErrorMsg('Password must be at least 8 characters with uppercase, lowercase, number, and special character.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP email');
      setStage('otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!/^\d{6}$/.test(otp.trim())) {
      setErrorMsg('Please enter the 6-digit OTP sent to your email.');
      return;
    }

    setSubmitting(true);
    try {
      // Verify OTP → get otpToken
      const verifyRes = await fetch('/api/v1/otp/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email.trim(), otp: otp.trim() }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'OTP verification failed');

      const token = verifyData.otpToken;
      setOtpToken(token);

      // Register the user now that OTP is verified
      const regRes = await fetch('/api/v1/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:      form.name.trim(),
          email:     form.email.trim(),
          password:  form.password,
          otpToken:  token,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || regData.message || 'Registration failed');

      // Auto login user after registration
      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });
      const loginData = await loginRes.json();
      if (loginRes.ok) {
        setStorageItem('token', loginData.accessToken);
        setStorageItem('refreshToken', loginData.refreshToken);
        setStorageItem('userName', loginData.user.name);
        setStorageItem('userEmail', loginData.user.email);
        if (loginData.workspace?.id) {
          setStorageItem('workspaceId', loginData.workspace.id);
        }
      }

      setStage('success');
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setErrorMsg('');
    setOtp('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/otp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not resend OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared alert boxes ────────────────────────────────────────────────────
  const ErrorBox = () =>
    errorMsg ? (
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#ef4444', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        ⚠️ {errorMsg}
      </div>
    ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-primary)' }}>

      {/* Left Panel — Branding (unchanged) */}
      <div style={{
        width: '45%',
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(0,212,200,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', right: '-60px', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(99,102,241,0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--teal)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px', color: 'var(--bg-primary)' }}>O</div>
          <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>OMNI<span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>D</span>IMENSION</span>
        </Link>

        {/* Feature List */}
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '32px' }}>
            Build voice AI agents<br />
            <span style={{ color: 'var(--teal)' }}>in minutes, not months.</span>
          </h2>

          {[
            { icon: '⚡', title: 'Sub-500ms Latency', desc: 'Ultra-low latency for natural conversations' },
            { icon: '🌐', title: '90+ Languages', desc: 'Deploy globally with real-time translation' },
            { icon: '🔌', title: '1-Click Integrations', desc: 'Connect Salesforce, Cal.com, HubSpot & more' },
            { icon: '🛡️', title: 'Enterprise Ready', desc: 'SOC-2 compliant with dedicated support' },
          ].map((f) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(14,179,158,0.1)', border: '1px solid rgba(14,179,158,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{f.icon}</div>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{f.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
          <p style={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '13px', marginBottom: '12px' }}>Trusted by teams at</p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {['OpenAI', 'Salesforce', 'Twilio', 'HubSpot'].map(b => (
              <span key={b} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{b}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>

          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(14,179,158,0.08)', border: '1px solid rgba(14,179,158,0.2)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'var(--teal)', fontWeight: 600, marginBottom: '16px' }}>✨ Free plan — no credit card needed</div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '6px' }}>
              {stage === 'otp' ? 'Verify your email' : 'Create your account'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Already have an account? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Sign in →</Link>
            </p>
          </div>

          {/* ── Stage: form ───────────────────────────────────────────────── */}
          {stage === 'form' && (
            <>
              {/* Google Sign Up (unchanged) */}
              <button
                type="button"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '11px 16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '24px',
                  transition: 'background 0.2s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseOut={e => (e.currentTarget.style.background = 'var(--bg-card)')}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ color: 'var(--text-secondary)', opacity: 0.8, fontSize: '12px', fontWeight: 500 }}>or sign up with email</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>

              {/* Signup Form */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <ErrorBox />

                {/* Full Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    className="form-input"
                    placeholder="John Smith"
                    value={form.name}
                    onChange={handleChange}
                    required
                    style={{ width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </div>

                {/* Work Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Work Email</label>
                  <input
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="john@company.com"
                    value={form.email}
                    onChange={handleChange}
                    required
                    style={{ width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      className="form-input"
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={handleChange}
                      required
                      style={{ width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', paddingRight: '44px' }}
                    />
                    <button
                      type="button"
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', padding: 0 }}
                      onClick={() => setShowPass(!showPass)}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Password strength */}
                  {form.password.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4].map(i => {
                        const strength = form.password.length >= 12 ? 4 : form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : 1;
                        const color = strength >= 3 ? 'var(--teal)' : strength === 2 ? '#f59e0b' : '#ef4444';
                        return <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= strength ? color : 'var(--border)', transition: 'background 0.3s' }} />;
                      })}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Confirm Password</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    name="confirm"
                    className="form-input"
                    placeholder="Re-enter your password"
                    value={form.confirm}
                    onChange={handleChange}
                    required
                    style={{ width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.8, lineHeight: 1.5, margin: 0 }}>
                  By signing up, you agree to our{' '}
                  <a href="#" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Terms of Service</a> and{' '}
                  <a href="#" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Privacy Policy</a>.
                </p>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '13px',
                    fontSize: '15px',
                    fontWeight: 700,
                    marginTop: '4px',
                    transition: 'background 0.2s, transform 0.1s',
                    color: 'var(--bg-primary)',
                  }}
                >
                  {submitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Sending OTP...
                    </span>
                  ) : 'Create Free Account →'}
                </button>
              </form>
            </>
          )}

          {/* ── Stage: otp ────────────────────────────────────────────────── */}
          {stage === 'otp' && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ErrorBox />

              <div style={{ background: 'rgba(14,179,158,0.08)', border: '1px solid rgba(14,179,158,0.2)', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                ✉️ A 6-digit code was sent to <strong style={{ color: 'var(--text-primary)' }}>{form.email}</strong>. Enter it below to verify your email.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="form-input"
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  style={{ width: '100%', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: '20px', letterSpacing: '0.35em', textAlign: 'center' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || stage === 'success'}
                style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: 700, color: 'var(--bg-primary)' }}
              >
                {submitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Verifying...
                  </span>
                ) : 'Verify OTP & Create Account →'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <button
                  type="button"
                  onClick={() => { setStage('form'); setOtp(''); setErrorMsg(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: '13px' }}
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={submitting}
                  style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600 }}
                >
                  Resend OTP
                </button>
              </div>
            </form>
          )}

          {/* ── Stage: success ────────────────────────────────────────────── */}
          {stage === 'success' && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '16px', color: '#22c55e', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ✓ Account created! Redirecting to dashboard...
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
