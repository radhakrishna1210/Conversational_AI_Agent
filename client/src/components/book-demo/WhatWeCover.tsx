import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Live agent walkthrough',
    description: 'Watch a Voice AI agent handle a real call end-to-end.',
  },
  {
    title: 'Build, deploy, monitor',
    description:
      'How to ship agents for inbound support, outbound sales, and bulk-call campaigns.',
  },
  {
    title: 'Integrations that fit',
    description: 'Connect your CRM, calendar, telephony, and existing workflows.',
  },
  {
    title: 'Pricing and scale',
    description: 'Volume discounts, white-label, and enterprise options tailored to your numbers.',
  },
];

export default function WhatWeCover() {
  return (
    <section className="book-demo-cover">
      <h2>What we&apos;ll cover</h2>
      <p className="book-demo-cover-sub">
        Fifteen focused minutes. Bring your use case, leave with a plan.
      </p>

      <div className="book-demo-cover-grid">
        {features.map((feature) => (
          <article key={feature.title} className="book-demo-cover-card">
            <span className="book-demo-cover-check" aria-hidden="true">
              ✓
            </span>
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>

      <p className="book-demo-cover-footer">
        Prefer to write in first? Visit our{' '}
        <Link to="/contact">contact page</Link> or read the{' '}
        <Link to="/documentation">product documentation</Link>.
      </p>
    </section>
  );
}
