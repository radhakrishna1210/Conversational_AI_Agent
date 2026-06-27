import { useState, useEffect } from 'react';
import { PopupModal } from 'react-calendly';
import { Check } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

const BASE = '/api/v1';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    callVolume: '',
    helpWith: '',
    useCase: '',
    heardAbout: ''
  });
  const [emailError, setEmailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string) => {
    if (!email) return true;
    const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com'];
    const domain = email.split('@')[1];
    return !genericDomains.includes(domain?.toLowerCase());
  };

  const [status, setStatus] = useState<'idle' | 'calendly' | 'success'>('idle');
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRootElement(document.getElementById('root') as HTMLElement);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateEmail(formData.email)) {
      setEmailError('Please use a business email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BASE}/contact-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to submit. Please try again.');
      }

      if (formData.helpWith === 'appointment') {
        setStatus('calendly');
      } else {
        setStatus('success');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCalendlyClose = () => {
    setStatus('success');
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin === 'https://calendly.com' && e.data?.event === 'calendly.event_scheduled') {
        setStatus('success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white pt-20 pb-12 px-4 sm:px-6 lg:px-8" style={{ background: 'radial-gradient(ellipse at center, rgba(14,179,158,0.05) 0%, #000 60%)' }}>
        <div className="mx-auto max-w-2xl w-full rounded-2xl p-10 text-center" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6" style={{ background: 'rgba(14,179,158,0.1)', border: '2px solid rgba(14,179,158,0.2)' }}>
             <Check size={32} style={{ color: 'var(--teal)' }} />
          </div>
          <h2 className="text-3xl font-bold mb-4">Thank You!</h2>
          <p className="text-[#888] mb-8">
            Thank you for taking the time to contact us. We look forward to connecting with you soon.
          </p>
          <button
            onClick={() => {
              setStatus('idle');
              setFormData({ name: '', email: '', phone: '', callVolume: '', helpWith: '', useCase: '', heardAbout: '' });
            }}
            className="rounded-lg px-6 py-3 font-semibold text-white transition bg-transparent"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-12 pb-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#0e1015' }}>
      
      {rootElement && status === 'calendly' && (
        <PopupModal
          url="https://calendly.com/disha-gudup24-vit"
          onModalClose={handleCalendlyClose}
          open={true}
          rootElement={rootElement}
          prefill={{
            name: formData.name,
            email: formData.email,
          }}
        />
      )}

      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-white tracking-tight">Contact Us</h1>
          <p className="mt-4 text-[#888] text-lg">Thank you for taking the time to contact us. We look forward to connecting with you soon.</p>
        </div>

        <div className="contact-form-card rounded-2xl p-8" style={{ background: '#0e1015', border: '1px solid rgba(255,255,255,0.05)' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-white focus:outline-none"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="John Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({...formData, email: e.target.value});
                    if (emailError) setEmailError('');
                  }}
                  onBlur={(e) => {
                    if (!validateEmail(e.target.value)) setEmailError('Please use a business email address.');
                  }}
                  className={`block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--teal)] focus:border-[var(--teal)] transition-all ${emailError ? 'border-red-500' : 'border-[rgba(255,255,255,0.1)]'}`}
                  style={{ borderWidth: '1px' }}
                  placeholder="john@company.com"
                />
                {emailError && <p className="mt-2 text-sm text-red-500">{emailError}</p>}
              </div>

              {/* Phone */}
              <div className="contact-phone-input">
                <label className="block text-sm font-medium text-white mb-2">Phone Number <span className="text-red-500">*</span></label>
                <PhoneInput
                  international
                  defaultCountry="US"
                  value={formData.phone}
                  onChange={(val) => setFormData({...formData, phone: val || ''})}
                  className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-white focus-within:ring-1 focus-within:ring-[var(--teal)] focus-within:border-[var(--teal)] transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Monthly Call Volume */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Monthly Call Volume <span className="text-red-500">*</span></label>
                <select
                  required
                  value={formData.callVolume}
                  onChange={(e) => setFormData({...formData, callVolume: e.target.value})}
                  className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-[#888] focus:outline-none appearance-none"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option value="" disabled>Select volume</option>
                  <option value="Not sure">Not sure, I am just getting started</option>
                  <option value="< 1,000">&lt; 1,000 minutes / month</option>
                  <option value="1,001 - 5,000">1,001 &ndash; 5,000 minutes / month</option>
                  <option value="5,001 - 20,000">5,001 &ndash; 20,000 minutes / month</option>
                  <option value="20,000+">20,000+ minutes / month</option>
                </select>
              </div>
            </div>

            {/* Help With */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">What can we help you with? <span className="text-red-500">*</span></label>
              <select
                required
                value={formData.helpWith}
                onChange={(e) => setFormData({...formData, helpWith: e.target.value})}
                className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-[#888] focus:outline-none appearance-none"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value="" disabled>Select an option</option>
                <option value="pricing">Pricing enquiry</option>
                <option value="product">Product question</option>
                <option value="whitelabel">White label pricing (Voice AI)</option>
                <option value="enterprise">Enterprise / custom plan</option>
                <option value="partnership">Partnership / affiliate</option>
                <option value="appointment">Book an appointment</option>
              </select>
            </div>

            {/* Use Case */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Describe your use case <span className="text-red-500">*</span></label>
              <textarea
                required
                rows={4}
                value={formData.useCase}
                onChange={(e) => setFormData({...formData, useCase: e.target.value})}
                className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-white focus:outline-none resize-none"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                placeholder="I'd like to discuss pricing for my team..."
              />
            </div>

            {/* Hear About */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">How did you hear about us? <span className="text-[#888]">(optional)</span></label>
              <select
                value={formData.heardAbout}
                onChange={(e) => setFormData({...formData, heardAbout: e.target.value})}
                className="block w-full rounded-lg bg-[#000000] px-4 py-3 text-sm text-[#888] focus:outline-none appearance-none"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value="" disabled>Select a channel</option>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">Twitter / X</option>
                <option value="google">Google Search</option>
                <option value="bing">Bing Search</option>
                <option value="chatgpt">ChatGPT / AI</option>
                <option value="referral">Referral / Word of mouth</option>
                <option value="other">Other</option>
              </select>
            </div>

            {submitError && (
              <p className="text-sm text-red-500">{submitError}</p>
            )}

            <div className="pt-4 pb-2">
               <p className="text-[#888] text-sm mb-6">
                 This site is protected by reCAPTCHA and the Google <a href="#" className="text-[var(--teal)]">Privacy Policy</a> and <a href="#" className="text-[var(--teal)]">Terms of Service</a> apply.
               </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg px-6 py-3 text-sm font-semibold text-black transition disabled:opacity-60 disabled:cursor-not-allowed"
                className="contact-submit-btn rounded-lg px-6 py-3 text-sm font-semibold text-black transition"
                style={{ backgroundColor: 'var(--teal)' }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
