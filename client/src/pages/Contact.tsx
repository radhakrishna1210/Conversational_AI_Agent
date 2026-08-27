import { useState, useEffect } from 'react';
import { PopupModal } from 'react-calendly';
import { Check, Mail, MessageSquare, Zap } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { RzCard } from '@/components/rz';
/**
 * Contact — the two-column layout from Spandan Support.dc.html#contact.
 *
 * Reassurance on the left, form on the right. The page previously painted its
 * own palette (#0e1015 page, #000000 fields, #888 body text, black button
 * label) with no reference to the tokens, so it was the one public page that
 * stayed dark when the rest of the site went light, and its field borders
 * disappeared entirely against white.
 */

const BASE = '/api/v1';

const REASSURANCE = [
  { icon: <Zap size={16} />, title: 'One business day', detail: 'A real person replies — usually much sooner.' },
  { icon: <MessageSquare size={16} />, title: 'Live demo on request', detail: 'We will call you with a Spandan agent, naturally.' },
  { icon: <Mail size={16} />, title: 'Pricing, plainly', detail: 'Tell us your volume and we will walk through the numbers.' },
];

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    callVolume: '',
    helpWith: '',
    useCase: '',
    heardAbout: '',
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
  const validateName = (name: string) => /^[A-Za-z ]{2,50}$/.test(name.trim());

  const [status, setStatus] = useState<'idle' | 'calendly' | 'success'>('idle');
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRootElement(document.getElementById('root') as HTMLElement);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateName(formData.name)) {
      setSubmitError('Please enter a valid name using letters only.');
      return;
    }
    if (!formData.phone || !isValidPhoneNumber(formData.phone)) {
      setSubmitError('Please enter a valid phone number.');
      return;
    }
    if (formData.useCase.trim().length < 10) {
      setSubmitError('Please tell us a little more about your use case.');
      return;
    }
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

  const handleCalendlyClose = () => setStatus('success');

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
      <div className="rz-page" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh', padding: '60px 24px' }}>
        <RzCard size="lg" style={{ maxWidth: 560, width: '100%', textAlign: 'center', borderRadius: 18 }}>
          <div className="rz-mark rz-mark-lg" style={{ width: 60, height: 60, margin: '0 auto 18px' }}>
            <Check size={28} />
          </div>
          <h2 className="rz-h2">Thank you</h2>
          <p className="rz-sub-lg" style={{ margin: '12px auto 24px', maxWidth: 420 }}>
            Your note is with us. Someone will reply within one business day — usually sooner.
          </p>
          <button
            className="rz-btn rz-btn-secondary"
            onClick={() => {
              setStatus('idle');
              setFormData({ name: '', email: '', phone: '', callVolume: '', helpWith: '', useCase: '', heardAbout: '' });
            }}
          >
            Send another request
          </button>
        </RzCard>
      </div>
    );
  }

  return (
    <div className="rz-page" style={{ padding: '56px 24px 90px' }}>
      {rootElement && status === 'calendly' && (
        <PopupModal
          url="https://calendly.com/disha-gudup24-vit"
          onModalClose={handleCalendlyClose}
          open
          rootElement={rootElement}
          prefill={{ name: formData.name, email: formData.email }}
        />
      )}

      <div className="rz-wrap-wide" style={{ maxWidth: 1080 }}>
        <div className="sp-contact-grid">
          {/* Left: the pitch */}
          <div>
            <div className="rz-eyebrow">Contact</div>
            <h1 className="rz-h1" style={{ fontSize: 'clamp(28px, 3.4vw, 42px)', margin: '10px 0 0' }}>
              Talk to a human.
            </h1>
            <p className="rz-sub-lg" style={{ margin: '12px 0 24px', maxWidth: 440 }}>
              Sales questions, a custom deployment, or just want a live demo? Send a note and we
              will reply within one business day.
            </p>

            <div className="rz-stack-sm">
              {REASSURANCE.map(c => (
                <div
                  key={c.title}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 13, padding: 15 }}
                >
                  <span className="rz-mark" style={{ width: 38, height: 38, borderRadius: 10 }}>{c.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx)' }}>{c.title}</div>
                    <div className="rz-sub" style={{ fontSize: 12.5 }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: the form */}
          <div className="rz-card rz-card-lg" style={{ borderRadius: 18 }}>
            <form onSubmit={handleSubmit} className="rz-stack" style={{ gap: 14 }}>
              <div className="rz-grid-2" style={{ gap: 12 }}>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-name">Name *</label>
                  <input
                    id="c-name" type="text" required className="rz-input" placeholder="Dan Alvarez"
                    value={formData.name}
                    onChange={(e) => {
                      if (/^[A-Za-z ]*$/.test(e.target.value)) setFormData({ ...formData, name: e.target.value });
                    }}
                  />
                </div>

                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-email">Work email *</label>
                  <input
                    id="c-email" type="email" required className="rz-input" placeholder="you@company.com"
                    style={emailError ? { borderColor: 'var(--err)' } : undefined}
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (emailError) setEmailError('');
                    }}
                    onBlur={(e) => {
                      if (!validateEmail(e.target.value)) setEmailError('Please use a business email address.');
                    }}
                  />
                  {emailError && <div className="rz-field-error">{emailError}</div>}
                </div>
              </div>

              <div className="rz-grid-2" style={{ gap: 12 }}>
                <div className="rz-field contact-phone-input">
                  <label className="rz-field-label">Phone *</label>
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val || '' })}
                    className="rz-input"
                  />
                </div>

                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-volume">Monthly call volume *</label>
                  <select
                    id="c-volume" required className="rz-select"
                    value={formData.callVolume}
                    onChange={(e) => setFormData({ ...formData, callVolume: e.target.value })}
                  >
                    <option value="" disabled>Select volume</option>
                    <option value="Not sure">Not sure, just getting started</option>
                    <option value="&lt; 1,000">&lt; 1,000 minutes / month</option>
                    <option value="1,001 - 5,000">1,001 – 5,000 minutes / month</option>
                    <option value="5,001 - 20,000">5,001 – 20,000 minutes / month</option>
                    <option value="20,000+">20,000+ minutes / month</option>
                  </select>
                </div>
              </div>

              <div className="rz-field">
                <label className="rz-field-label" htmlFor="c-help">What can we help with? *</label>
                <select
                  id="c-help" required className="rz-select"
                  value={formData.helpWith}
                  onChange={(e) => setFormData({ ...formData, helpWith: e.target.value })}
                >
                  <option value="" disabled>Select an option</option>
                  <option value="pricing">Pricing enquiry</option>
                  <option value="product">Product question</option>
                  <option value="whitelabel">White label (Voice AI)</option>
                  <option value="enterprise">Enterprise / custom deployment</option>
                  <option value="partnership">Partnership / affiliate</option>
                  <option value="appointment">Book an appointment</option>
                </select>
              </div>

              <div className="rz-field">
                <label className="rz-field-label" htmlFor="c-usecase">Describe your use case *</label>
                <textarea
                  id="c-usecase" required rows={4} className="rz-textarea"
                  placeholder="Tell us about your use case and call volume…"
                  value={formData.useCase}
                  onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                />
              </div>

              <div className="rz-field">
                <label className="rz-field-label" htmlFor="c-heard">
                  How did you hear about us? <span className="rz-muted" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  id="c-heard" className="rz-select"
                  value={formData.heardAbout}
                  onChange={(e) => setFormData({ ...formData, heardAbout: e.target.value })}
                >
                  <option value="" disabled>Select a channel</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="twitter">Twitter / X</option>
                  <option value="google">Google Search</option>
                  <option value="bing">Bing Search</option>
                  <option value="chatgpt">ChatGPT / AI</option>
                  <option value="referral">Referral / word of mouth</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {submitError && <div className="rz-field-error">{submitError}</div>}

              <button
                type="submit"
                className="rz-btn rz-btn-primary rz-btn-block"
                style={{ padding: 13, fontSize: 14.5, marginTop: 4 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Sending…</> : 'Send request'}
              </button>

              <p className="rz-mono-xs" style={{ lineHeight: 1.6, textAlign: 'center', margin: 0 }}>
                Protected by reCAPTCHA — Google's Privacy Policy and Terms of Service apply.
              </p>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        .sp-contact-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 22px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .sp-contact-grid { grid-template-columns: 1fr; }
        }

        /*
          react-phone-number-input renders its own <input> inside our container,
          and ships a stylesheet that paints it white. Neutralise that so the
          field reads as one of ours rather than a pasted-in third-party control.
        */
        .contact-phone-input .PhoneInput { gap: 8px; }
        .contact-phone-input .PhoneInputInput {
          background: transparent;
          border: none;
          outline: none;
          color: var(--tx);
          font-family: var(--ff-b);
          font-size: 13.5px;
        }
        .contact-phone-input .PhoneInputCountrySelect { color: var(--tx); }
        .contact-phone-input .PhoneInputCountrySelectArrow { color: var(--tx-3); opacity: 1; }
      `}</style>
    </div>
  );
}
