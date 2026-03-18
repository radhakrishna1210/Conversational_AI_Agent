import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (form.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('submitting');
    // Simulate API call
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => navigate('/dashboard'), 800);
    }, 1500);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-primary)' }}>

      {/* Left Panel — Branding */}
      <div style={{
        width: '45%',
        background: 'linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #091a2f 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(0,212,200,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', right: '-60px', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', background: 'var(--teal)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px', color: '#0a0a0a' }}>O</div>
          <span style={{ fontWeight: 800, fontSize: '18px', color: 'white', letterSpacing: '-0.5px' }}>OMNI<span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>D</span>IMENSION</span>
        </Link>

        {/* Feature List */}
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'white', lineHeight: 1.3, marginBottom: '32px' }}>
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
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(0,212,200,0.1)', border: '1px solid rgba(0,212,200,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{f.icon}</div>
              <div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{f.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>Trusted by teams at</p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {['OpenAI', 'Salesforce', 'Twilio', 'HubSpot'].map(b => (
              <span key={b} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{b}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>

          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0,212,200,0.08)', border: '1px solid rgba(0,212,200,0.2)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'var(--teal)', fontWeight: 600, marginBottom: '16px' }}>✨ Free plan — no credit card needed</div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', marginBottom: '6px' }}>Create your account</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Already have an account? <Link to="/dashboard" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Sign in →</Link>
            </p>
          </div>

          {/* Google Sign Up */}
          <button
            type="button"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '11px 16px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '24px',
              transition: 'background 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onClick={() => navigate('/dashboard')}
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
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500 }}>or sign up with email</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Error */}
            {errorMsg && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Success */}
            {status === 'success' && (
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#86efac', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✓ Account created! Redirecting to dashboard...
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Full Name</label>
              <input
                type="text"
                name="name"
                className="form-input"
                placeholder="John Smith"
                value={form.name}
                onChange={handleChange}
                required
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Work Email</label>
              <input
                type="email"
                name="email"
                className="form-input"
                placeholder="john@company.com"
                value={form.email}
                onChange={handleChange}
                required
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  className="form-input"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', paddingRight: '44px' }}
                />
                <button
                  type="button"
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', padding: 0 }}
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
                    return <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= strength ? color : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />;
                  })}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Confirm Password</label>
              <input
                type={showPass ? 'text' : 'password'}
                name="confirm"
                className="form-input"
                placeholder="Re-enter your password"
                value={form.confirm}
                onChange={handleChange}
                required
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)' }}
              />
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              By signing up, you agree to our{' '}
              <a href="#" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Terms of Service</a> and{' '}
              <a href="#" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Privacy Policy</a>.
            </p>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === 'submitting' || status === 'success'}
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '15px',
                fontWeight: 700,
                marginTop: '4px',
                background: status === 'success' ? '#22c55e' : undefined,
                transition: 'background 0.2s, transform 0.1s',
              }}
            >
              {status === 'idle' && 'Create Free Account →'}
              {status === 'submitting' && (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Creating account...
                </span>
              )}
              {status === 'success' && '✓ Done!'}
            </button>
          </form>

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
