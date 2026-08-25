import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PopupModal } from 'react-calendly';
import { ArrowUpRight, CalendarClock, Check, Mail, MessageSquare, Zap } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { RzCard } from '@/components/rz';
import { BRAND } from '@/lib/brand';

/**
 * Contact — the sales page. Two columns: who you are reaching on the left, the
 * qualifying form on the right.
 *
 * It is titled "Connect with our sales team" rather than "Contact", and the
 * landing page ends on a band pointing here, because no price is published
 * anywhere public (see the header of Pricing.tsx) — a conversation is the only
 * way a visitor gets a number, so the route to one has to be obvious.
 *
 * Two things the earlier version got wrong, and why the markup looks the way it
 * does now:
 *
 *   • It offered exactly one way through — seven fields, all but one required.
 *     Someone who only wants to send a sentence had no door. Email and the demo
 *     booking now sit above the fold as their own targets.
 *
 *   • The form was one undifferentiated run of eight controls. It is now split
 *     into "who you are" and "what you need", so the length reads as two short
 *     steps rather than a wall.
 *
 * Colours come from the tokens throughout. The page used to paint its own
 * palette (#0e1015 page, #000000 fields, #888 body text) and so stayed dark
 * when the rest of the site went light, with field borders that disappeared
 * against white.
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
          {/* Left: who you are about to reach, and the two ways to skip the form */}
          <div className="sp-contact-aside">
            <div className="rz-eyebrow-pill">
              <span className="sp-contact-dot" /> Sales
            </div>
            <h1 className="sp-contact-h1">Connect with our sales team.</h1>
            <p className="rz-sub-lg" style={{ margin: '14px 0 0', maxWidth: 460 }}>
              Tell us your call volume and what the agent needs to do. We will walk through pricing
              for your numbers, run a live demo on a real call, and scope anything custom — white
              label, your own carrier, or an on-prem deployment.
            </p>

            {/* The form is the main path, but a visitor who just wants to write to
                someone should not have to fill in seven fields to do it. */}
            <div className="sp-contact-direct">
              <a href={`mailto:${BRAND.supportEmail}`} className="sp-contact-row">
                <span className="rz-mark"><Mail size={16} /></span>
                <span className="sp-contact-row-body">
                  <span className="sp-contact-row-t">Email us directly</span>
                  <span className="sp-contact-row-d">{BRAND.supportEmail}</span>
                </span>
                <ArrowUpRight size={16} className="sp-contact-row-go" />
              </a>

              <Link to="/book-appointment" className="sp-contact-row">
                <span className="rz-mark"><CalendarClock size={16} /></span>
                <span className="sp-contact-row-body">
                  <span className="sp-contact-row-t">Book a 30-minute demo</span>
                  <span className="sp-contact-row-d">Pick a slot that suits you</span>
                </span>
                <ArrowUpRight size={16} className="sp-contact-row-go" />
              </Link>
            </div>

            <div className="sp-contact-promises">
              {REASSURANCE.map(c => (
                <div key={c.title} className="sp-contact-promise">
                  <span className="sp-contact-promise-i">{c.icon}</span>
                  <div>
                    <div className="sp-contact-promise-t">{c.title}</div>
                    <div className="sp-contact-promise-d">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: the form */}
          <div className="sp-contact-card">
            <div className="sp-contact-card-head">
              <h2 className="sp-contact-card-h">Send us a note</h2>
              <p className="sp-contact-card-sub">
                Takes about a minute. Everything marked <span className="sp-req">*</span> is required.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="rz-stack" style={{ gap: 14 }}>
              <div className="sp-contact-legend">Who you are</div>

              <div className="rz-grid-2" style={{ gap: 12 }}>
                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-name">Name <span className="sp-req">*</span></label>
                  <input
                    id="c-name" type="text" required className="rz-input" placeholder="Dan Alvarez"
                    value={formData.name}
                    onChange={(e) => {
                      if (/^[A-Za-z ]*$/.test(e.target.value)) setFormData({ ...formData, name: e.target.value });
                    }}
                  />
                </div>

                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-email">Work email <span className="sp-req">*</span></label>
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
                  <label className="rz-field-label">Phone <span className="sp-req">*</span></label>
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val || '' })}
                    className="rz-input"
                  />
                </div>

                <div className="rz-field">
                  <label className="rz-field-label" htmlFor="c-volume">Monthly call volume <span className="sp-req">*</span></label>
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

              <div className="sp-contact-legend" style={{ marginTop: 8 }}>What you need</div>

              <div className="rz-field">
                <label className="rz-field-label" htmlFor="c-help">What can we help with? <span className="sp-req">*</span></label>
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
                <label className="rz-field-label" htmlFor="c-usecase">Describe your use case <span className="sp-req">*</span></label>
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

              {submitError && (
                <div className="sp-contact-err" role="alert">{submitError}</div>
              )}

              <button
                type="submit"
                className="rz-btn rz-btn-primary rz-btn-block rz-btn-lg"
                style={{ marginTop: 6 }}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Sending…</>
                  : <>Connect with sales <ArrowUpRight size={17} /></>}
              </button>

              {/*
                The old line here claimed reCAPTCHA protection and cited Google's
                terms. Nothing on this page loads reCAPTCHA, so it was a promise
                the build does not keep — replaced with what actually happens to
                the details typed above.
              */}
              <p className="sp-contact-fine">
                We use these details only to reply to this request. No list, no resale.
              </p>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        .sp-contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 44px;
          align-items: start;
        }

        /*
          Not sticky. The aside is within ~100px of the form's height, so
          pinning it only ever scrolled its own heading up behind the fixed
          navbar — it buys no reachability and costs the h1.
        */

        .sp-contact-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--cyan);
          box-shadow: 0 0 10px var(--cyan);
        }

        .sp-contact-h1 {
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: clamp(30px, 3.6vw, 46px);
          line-height: 1.04;
          letter-spacing: -0.02em;
          color: var(--tx);
          margin: 16px 0 0;
          max-width: 12ch;
        }

        /* ── The two ways past the form ─────────────────────────────────── */

        .sp-contact-direct {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 30px 0 0;
          max-width: 460px;
        }

        .sp-contact-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border: 1px solid var(--line-2);
          border-radius: 13px;
          background: var(--s1);
          text-decoration: none;
          transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
        }

        .sp-contact-row:hover {
          border-color: var(--cyan);
          background: var(--s2);
          transform: translateY(-1px);
        }

        .sp-contact-row-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

        .sp-contact-row-t {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--tx);
        }

        .sp-contact-row-d {
          font-size: 12.5px;
          color: var(--tx-3);
          overflow-wrap: anywhere;
        }

        .sp-contact-row-go {
          margin-left: auto;
          flex: none;
          color: var(--tx-3);
          transition: color 0.16s ease, transform 0.16s ease;
        }

        .sp-contact-row:hover .sp-contact-row-go {
          color: var(--cyan-fg);
          transform: translate(2px, -2px);
        }

        /* ── What happens after you send ────────────────────────────────── */

        .sp-contact-promises {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin: 30px 0 0;
          padding: 22px 0 0;
          border-top: 1px solid var(--line);
          max-width: 460px;
        }

        .sp-contact-promise { display: flex; align-items: flex-start; gap: 12px; }

        .sp-contact-promise-i {
          flex: none;
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          color: var(--cyan-fg);
          background: rgba(14, 179, 158, 0.11);
          border: 1px solid rgba(14, 179, 158, 0.25);
        }

        .sp-contact-promise-t { font-size: 13.5px; font-weight: 600; color: var(--tx); }
        .sp-contact-promise-d { font-size: 12.5px; color: var(--tx-3); line-height: 1.55; margin-top: 2px; }

        /* ── The form card ──────────────────────────────────────────────── */

        .sp-contact-card {
          background: var(--s1);
          border: 1px solid var(--line-2);
          border-radius: 18px;
          padding: 26px;
          box-shadow: var(--shadow-card);
        }

        .sp-contact-card-head {
          margin: 0 0 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--line);
        }

        .sp-contact-card-h {
          font-family: var(--ff-d);
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--tx);
          margin: 0;
        }

        .sp-contact-card-sub { font-size: 13px; color: var(--tx-3); margin: 6px 0 0; }

        /* Splits the eight controls into two readable groups. */
        .sp-contact-legend {
          font-family: var(--ff-m);
          font-size: 11px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--tx-3);
        }

        .sp-req { color: var(--cyan-fg); }

        .sp-contact-err {
          font-size: 13px;
          color: var(--err);
          background: rgba(248, 113, 113, 0.1);
          border: 1px solid rgba(248, 113, 113, 0.3);
          border-radius: 10px;
          padding: 10px 12px;
        }

        .sp-contact-fine {
          font-size: 12px;
          line-height: 1.6;
          text-align: center;
          color: var(--tx-3);
          margin: 0;
        }

        /* One column below 900px; sticky is meaningless once the aside sits
           above the form rather than beside it. */
        @media (max-width: 900px) {
          .sp-contact-grid { grid-template-columns: 1fr; gap: 32px; }
          .sp-contact-h1 { max-width: none; }
          .sp-contact-card { padding: 20px; }
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
          min-width: 0;
        }
        .contact-phone-input .PhoneInputCountrySelect { color: var(--tx); }
        .contact-phone-input .PhoneInputCountrySelectArrow { color: var(--tx-3); opacity: 1; }
      `}</style>
    </div>
  );
}
