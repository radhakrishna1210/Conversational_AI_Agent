import { useState } from 'react';

export default function BookAppointment() {
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
          <h1>Book an Appointment</h1>
          <p>Schedule a time with our team to discuss your needs and how we can help.</p>
        </div>
      </div>

      <div className="container" style={{paddingBottom:'80px'}}>
        <div className="form-card">
          <form className="booking-form" onSubmit={handleSubmit}>
            
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
                  <option>Custom Solution</option>
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
                  <option>Sales Manager</option>
                  <option>Operations</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="form-section-title">Reason for Contact</div>
            <div className="form-group">
              <label className="form-label">Reason to contact us <span className="required">*</span></label>
              <select className="form-select" required defaultValue="">
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
              <label className="form-label">What is the monthly call volume? <span className="required">*</span></label>
              <select className="form-select" required defaultValue="">
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
              <select className="form-select" required defaultValue="">
                <option value="" disabled>Select user type</option>
                <option>Individual / Freelancer</option>
                <option>Startup (1–10 employees)</option>
                <option>Small Business (11–50)</option>
                <option>Mid-Market (51–500)</option>
                <option>Enterprise (500+)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">What is your industry? <span className="required">*</span></label>
              <input type="text" className="form-input" placeholder="e.g., healthcare, finance, etc." required />
            </div>

            <div className="form-group">
              <label className="form-label">Please explain a little more about your use-case <span className="required">*</span></label>
              <textarea className="form-textarea" placeholder="e.g., outgoing calls for lead generation..." required></textarea>
            </div>

            <p className="form-note">This site is protected by reCAPTCHA and the Google <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a> apply.</p>

            <div style={{display:'flex', justifyContent:'flex-end', marginTop:'28px'}}>
              <button 
                type="submit" 
                className="btn btn-primary btn-lg" 
                disabled={status !== 'idle'}
                style={{ background: status === 'success' ? '#22c55e' : '' }}
              >
                {status === 'idle' && 'Book Appointment'}
                {status === 'submitting' && 'Booking...'}
                {status === 'success' && '✓ Booked!'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
