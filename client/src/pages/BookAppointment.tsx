import { useState } from 'react';

const BASE = '/api/v1';

interface FormData {
  name: string;
  email: string;
  phone: string;
  projectType: string;
  role: string;
  reason: string;
  callVolume: string;
  userType: string;
  industry: string;
  useCase: string;
}

const EMPTY: FormData = {
  name: '', email: '', phone: '', projectType: '', role: '',
  reason: '', callVolume: '', userType: '', industry: '', useCase: '',
};

export default function BookAppointment() {
  const [form, setForm] = useState<FormData>(EMPTY);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch(`${BASE}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      setStatus('success');
      setForm(EMPTY);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <>
        <div className="page-hero">
          <div className="container">
            <h1>Book an Appointment</h1>
            <p>Schedule a time with our team to discuss your needs.</p>
          </div>
        </div>
        <div className="container" style={{ paddingBottom: '80px' }}>
          <div className="form-card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ marginBottom: '12px' }}>Appointment Booked!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
              Thank you! We've received your request and will reach out shortly to confirm your appointment.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setStatus('idle')}
            >
              Book Another
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <h1>Book an Appointment</h1>
          <p>Schedule a time with our team to discuss your needs and how we can help.</p>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: '80px' }}>
        <div className="form-card">
          <form className="booking-form" onSubmit={handleSubmit}>

            <div className="form-section-title">Personal Information</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Name <span className="required">*</span></label>
                <input type="text" className="form-input" placeholder="John Smith" required value={form.name} onChange={set('name')} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Email <span className="required">*</span>{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(Business/Work Email)</span>
                </label>
                <input type="email" className="form-input" placeholder="john@company.com" required value={form.email} onChange={set('email')} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number <span className="required">*</span></label>
              <input type="tel" className="form-input" placeholder="+917887654321" required value={form.phone} onChange={set('phone')} />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Project Type <span className="required">*</span></label>
                <select className="form-select" required value={form.projectType} onChange={set('projectType')}>
                  <option value="" disabled>Select project type</option>
                  <option>Lead Generation</option>
                  <option>Customer Support</option>
                  <option>Appointment Booking</option>
                  <option>Collections</option>
                  <option>Custom Solution</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Your Role <span className="required">*</span></label>
                <select className="form-select" required value={form.role} onChange={set('role')}>
                  <option value="" disabled>Select your role</option>
                  <option>Founder / CEO</option>
                  <option>CTO / Technical Lead</option>
                  <option>Product Manager</option>
                  <option>Developer</option>
                  <option>Sales Manager</option>
                  <option>Operations</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="form-section-title">Reason for Contact</div>
            <div className="form-group">
              <label className="form-label">Reason to contact us <span className="required">*</span></label>
              <select className="form-select" required value={form.reason} onChange={set('reason')}>
                <option value="" disabled>Select a reason</option>
                <option>Product Demo</option>
                <option>Pricing Inquiry</option>
                <option>Technical Support</option>
                <option>Partnership Opportunity</option>
                <option>Enterprise Sales</option>
                <option>General Inquiry</option>
              </select>
            </div>

            <div className="form-section-title">Usage Information</div>
            <div className="form-group">
              <label className="form-label">Monthly call volume <span className="required">*</span></label>
              <select className="form-select" required value={form.callVolume} onChange={set('callVolume')}>
                <option value="" disabled>Select call volume</option>
                <option>Less than 100 calls/month</option>
                <option>100 – 500 calls/month</option>
                <option>500 – 2,000 calls/month</option>
                <option>2,000 – 10,000 calls/month</option>
                <option>10,000+ calls/month</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">What best describes you? <span className="required">*</span></label>
              <select className="form-select" required value={form.userType} onChange={set('userType')}>
                <option value="" disabled>Select user type</option>
                <option>Individual / Freelancer</option>
                <option>Startup (1–10 employees)</option>
                <option>Small Business (11–50)</option>
                <option>Mid-Market (51–500)</option>
                <option>Enterprise (500+)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Industry <span className="required">*</span></label>
              <input type="text" className="form-input" placeholder="e.g., healthcare, finance, etc." required value={form.industry} onChange={set('industry')} />
            </div>

            <div className="form-group">
              <label className="form-label">Describe your use case <span className="required">*</span></label>
              <textarea className="form-textarea" placeholder="e.g., outgoing calls for lead generation..." required value={form.useCase} onChange={set('useCase')} />
            </div>

            {status === 'error' && (
              <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>{errorMsg}</p>
            )}

            <p className="form-note">
              This site is protected by reCAPTCHA and the Google{' '}
              <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a> apply.
            </p>

            
            <div className="booking-submit-row" style={{display:'flex', justifyContent:'flex-end', marginTop:'28px'}}>
              <button 
                type="submit" 
                className="btn btn-primary btn-lg" 
                disabled={status !== 'idle'}
                style={{ background: status === 'success' ? '#22c55e' : '' }}
              >
                {status === 'submitting' ? 'Booking...' : 'Book Appointment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
