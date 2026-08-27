import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import './Home.css';

/*
 * Public pricing.
 *
 * History, so nobody "restores" an old version by mistake:
 *   1. A monthly plan catalogue (Starter / Growth / Enterprise) with a table.
 *   2. Catalogue deleted when billing moved to a prepaid wallet; the page then
 *      rendered the live per-minute rate from GET /config/wallet-rate.
 *   3. The rate was removed too — a page that explained the model and handed
 *      the number to a person.
 *   4. (this version) The rate is published again: ₹6 / talk-minute for voice,
 *      shown in a Ringg-style product/inclusion matrix. The figure below is the
 *      single source of truth on this page — keep it in step with the Default
 *      rate in Super Admin → Pricing and what Billing shows a signed-in account.
 *
 * The page reuses the landing page's `.lp` styling (Home.css) so Pricing and
 * Home read as one site.
 */

/** Published headline rate. Keep in sync with Super Admin → Pricing (Default rate). */
const VOICE_RATE = '₹6';
const VOICE_UNIT = '/ talk-minute';

interface Row {
  label: string;
  payg: boolean | string;
  custom: boolean | string;
  product?: { name: string; sub: string; price?: string; unit?: string };
}

const TABLE: Row[] = [
  {
    label: '',
    product: { name: 'Voice agents', sub: 'Inbound & outbound phone calls', price: VOICE_RATE, unit: VOICE_UNIT },
    payg: '',
    custom: 'Contact sales',
  },
  { label: 'Speech recognition', payg: true, custom: true },
  { label: 'Language model', payg: true, custom: true },
  { label: 'Natural voice (40+ languages)', payg: true, custom: true },
  { label: 'Telephony', payg: true, custom: true },
  { label: 'Transcripts, analytics & call QA', payg: true, custom: true },
  { label: 'Unlimited agents & concurrent calls', payg: true, custom: true },
  { label: 'On-prem / private deployment', payg: false, custom: true },
  { label: 'White-label & bring-your-own carrier', payg: false, custom: true },
  { label: 'Dedicated onboarding & support', payg: false, custom: true },
  {
    label: '',
    product: { name: 'WhatsApp agents', sub: 'The same agent on WhatsApp Business', price: undefined, unit: undefined },
    payg: 'Talk to sales',
    custom: 'Custom',
  },
  { label: 'Two-way WhatsApp messaging', payg: true, custom: true },
  { label: 'Templates & reply flows', payg: true, custom: true },
  { label: 'Shares the voice agent’s knowledge base & tools', payg: true, custom: true },
];

const ADDONS = [
  { k: 'Phone number', v: 'billed at the carrier’s monthly rate' },
  { k: 'Concurrency', v: 'unlimited, included' },
  { k: 'Volume pricing', v: 'quoted against your expected minutes' },
];

const HOW = [
  { k: 'You’re billed for talk-minutes', v: 'The meter starts when the call connects and stops when it ends. Ringing, failed calls and idle agents cost nothing.' },
  { k: 'There’s no plan to pick', v: 'No tiers, no seats, no monthly minimum and nothing to cancel. Load a balance and spend it as your agents talk.' },
  { k: 'One figure covers the whole call', v: 'Recognition, the model, the voice and the phone line are not billed separately — the per-minute rate is the whole of it.' },
  { k: 'Your balance never expires', v: 'Top up by card or UPI, any amount, whenever you want. Every debit is itemised in the wallet ledger, one line per call.' },
];

type FaqCat = 'start' | 'billing' | 'numbers' | 'scale';

const FAQ_CATS: Array<{ key: FaqCat; label: string }> = [
  { key: 'start', label: 'Getting started' },
  { key: 'billing', label: 'Usage & billing' },
  { key: 'numbers', label: 'Numbers & carriers' },
  { key: 'scale', label: 'Scaling' },
];

const FAQ: Record<FaqCat, Array<{ q: string; a: string }>> = {
  start: [
    { q: 'Can I try it for free?', a: 'Yes. Sign up, build an agent and test it in the browser at no cost. You only pay once a real phone call connects, and only for the minutes it runs.' },
    { q: 'How soon can I launch?', a: 'An agent can be built and tested the same day. Going live on a phone number usually takes a few days, mostly number provisioning and verification.' },
    { q: 'Do I need to talk to sales to start?', a: 'No. The ₹6 per-minute rate is the published rate — you can start on it straight away. Sales is for volume pricing, a custom deployment, or WhatsApp.' },
  ],
  billing: [
    { q: 'How is a minute counted?', a: 'By connected talk-time, rounded to the minute. The meter runs from the moment the call answers to the moment it ends.' },
    { q: 'Do you charge for failed or ringing calls?', a: 'No. A call that never connects — busy, no answer, invalid number — costs nothing.' },
    { q: 'What happens if my balance runs out mid-campaign?', a: 'Calls pause when the balance reaches zero and resume the moment you top up. Nothing is lost.' },
    { q: 'Is the rate different for web calls?', a: 'Web calls skip the phone line, so there’s no telephony leg — talk to sales if browser and web-widget calls are a large part of your volume.' },
  ],
  numbers: [
    { q: 'Is a phone number included?', a: 'No. Rented numbers are billed separately at the carrier’s monthly rate, because that cost is the carrier’s, not ours.' },
    { q: 'Can I bring my own carrier or numbers?', a: 'Yes, on a custom plan. Voice runs over Twilio, SIP or supported carriers, and India numbers can carry verified caller identity so your brand shows on the dial.' },
  ],
  scale: [
    { q: 'Do you offer volume discounts?', a: 'Yes. Tell us your expected monthly minutes and we’ll quote a rate against them.' },
    { q: 'Is there an enterprise plan?', a: 'Yes — on-prem or private deployment, white-labelling, your own carrier, dedicated onboarding and support, all quoted per account.' },
  ],
};

function Mark({ v }: { v: boolean | string }) {
  if (v === true) return <span className="lp-price-yes" aria-label="included"><Check size={15} aria-hidden /></span>;
  if (v === false) return <span className="lp-price-no" aria-label="not included" />;
  return <>{v}</>;
}

export default function Pricing() {
  const [cat, setCat] = useState<FaqCat>('start');
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ.start[0].q);

  return (
    <div className="lp">
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-eyebrow">PRICING</div>
        <h1 className="lp-h1">Pay for the minutes your agents actually talk.</h1>
        <p className="lp-lede">
          One rate covers the whole call — the speech, the model, the voice and the phone line.
          No plans, no seats, no monthly minimum, nothing that renews.
        </p>

        <div className="lp-hero-cta">
          <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">Start free</Link>
          <Link to="/contact" className="lp-btn lp-btn-ghost lp-btn-lg">Talk to sales</Link>
        </div>

        <div className="lp-rate">
          <div className="lp-rate-figure">{VOICE_RATE}<span>{VOICE_UNIT}</span></div>
          <div className="lp-rate-note">
            Billed only while the call is connected. Ringing and failed calls cost nothing.
          </div>
        </div>
      </section>

      {/* ══ RATE MATRIX ═══════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-sechead">
          <div className="lp-eyebrow">WHAT YOU PAY</div>
          <h2 className="lp-h2">One line covers the whole conversation.</h2>
        </div>

        <div className="lp-price-wrap">
          <table className="lp-price-table">
            <thead>
              <tr>
                <th />
                <th>Pay as you go</th>
                <th>Custom</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map((row, i) =>
                row.product ? (
                  <tr key={i} className="lp-price-row-product">
                    <th scope="row">
                      <strong>{row.product.name}</strong>
                      <span>{row.product.sub}</span>
                    </th>
                    <td>
                      {row.product.price
                        ? <><b>{row.product.price}</b> <em>{row.product.unit}</em></>
                        : <Mark v={row.payg} />}
                    </td>
                    <td><Mark v={row.custom} /></td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <th scope="row">{row.label}</th>
                    <td><Mark v={row.payg} /></td>
                    <td><Mark v={row.custom} /></td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="lp-price-addons">
          {ADDONS.map((a) => (
            <span key={a.k}><b>{a.k}</b> — {a.v}</span>
          ))}
        </div>

        <p className="lp-price-foot">
          Prices in INR, exclusive of GST. The meter runs only while a call is connected.
          High-volume and enterprise rates are quoted per account — <Link to="/contact" style={{ color: 'var(--cyan-fg)' }}>talk to us</Link>.
        </p>
      </section>

      {/* ══ HOW BILLING WORKS ═════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-sechead">
          <div className="lp-eyebrow">HOW BILLING WORKS</div>
          <h2 className="lp-h2">A prepaid balance, spent by the minute.</h2>
        </div>
        <div className="lp-how">
          {HOW.map((row) => (
            <div key={row.k} className="lp-how-card">
              <div className="lp-how-k">{row.k}</div>
              <p className="lp-how-v">{row.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FAQ ═══════════════════════════════════════════════════════════ */}
      <section className="lp-sec">
        <div className="lp-sechead">
          <div className="lp-eyebrow">FAQ</div>
          <h2 className="lp-h2">Questions about billing.</h2>
        </div>

        <div className="lp-faq-tabs" role="tablist" aria-label="FAQ categories">
          {FAQ_CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={c.key === cat}
              className={`lp-faq-tab${c.key === cat ? ' is-on' : ''}`}
              onClick={() => { setCat(c.key); setOpenFaq(FAQ[c.key][0].q); }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="lp-faq">
          {FAQ[cat].map((f) => {
            const open = openFaq === f.q;
            return (
              <div key={f.q} className={`lp-faq-item${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : f.q)}
                >
                  <span>{f.q}</span>
                  <span className="lp-faq-sign" aria-hidden>{open ? '–' : '+'}</span>
                </button>
                {open && <p className="lp-faq-a">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════ */}
      <section className="lp-final">
        <h2 className="lp-final-h">See your first minute before you spend a rupee.</h2>
        <div className="lp-hero-cta" style={{ justifyContent: 'center', marginTop: 28 }}>
          <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">Start free</Link>
          <Link to="/contact" className="lp-btn lp-btn-ghost lp-btn-lg">Talk to sales</Link>
        </div>
      </section>
    </div>
  );
}
