import { useState } from 'react';

export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    }, 1500);
  };

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <h1>Contact Us</h1>
          <p>Thank you for taking the time to contact us. We look forward to connecting with you soon.</p>
        </div>
      </div>

      <div className="container" style={{paddingBottom:'80px'}}>
        <div className="form-card">
          <form className="contact-form" onSubmit={handleSubmit}>

            <div className="form-section-title">Personal Information</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Name <span className="required">*</span></label>
                <input type="text" className="form-input" placeholder="John Smith" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email <span className="required">*</span> <span style={{fontSize:'11px', color:'var(--text-muted)'}}>(Business/Work Email)</span></label>
                <input type="email" className="form-input" placeholder="john@company.com" required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number <span className="required">*</span></label>
              <input type="tel" className="form-input" placeholder="+917887654321" required />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Project Type <span className="required">*</span></label>
                <select className="form-select" required defaultValue="">
                  <option value="" disabled>Select project type</option>
                  <option>Lead Generation</option>
                  <option>Customer Support</option>
                  <option>Appointment Booking</option>
                  <option>Collections</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Your Role <span className="required">*</span></label>
                <select className="form-select" required defaultValue="">
                  <option value="" disabled>Select your role</option>
                  <option>Founder / CEO</option>
                  <option>CTO / Technical Lead</option>
                  <option>Product Manager</option>
                  <option>Developer</option>
                </select>
              </div>
            </div>

            <div className="form-section-title">Your Message</div>
            <div className="form-group">
              <label className="form-label">How can we help you? <span className="required">*</span></label>
              <textarea className="form-textarea" placeholder="Describe your request..." required></textarea>
            </div>

            <p className="form-note">This site is protected by reCAPTCHA and the Google <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a> apply.</p>

            <div style={{marginTop:'28px'}}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={status !== 'idle'}
                style={{ background: status === 'success' ? '#22c55e' : '' }}
              >
                {status === 'idle' && 'Submit Request'}
                {status === 'submitting' && 'Submitting...'}
                {status === 'success' && '✓ Submitted!'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
