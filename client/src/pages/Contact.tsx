import { useState } from 'react';

export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    }, 1000);
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto max-w-3xl rounded-3xl p-8 shadow-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--teal)' }}>Get in touch</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Contact Us</h1>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Fill out the form below and we’ll get back to you shortly.</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Name</label>
            <div className="mt-2">
              <input
                id="name"
                name="name"
                type="text"
                required
                className="block w-full rounded-2xl px-4 py-3 text-sm shadow-sm focus:outline-none"
                placeholder="John Doe"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                className="block w-full rounded-2xl px-4 py-3 text-sm shadow-sm focus:outline-none"
                placeholder="john@example.com"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Message</label>
            <div className="mt-2">
              <textarea
                id="message"
                name="message"
                rows={6}
                required
                className="block w-full rounded-3xl px-4 py-3 text-sm shadow-sm focus:outline-none"
                placeholder="Let us know how we can help."
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={status !== 'idle'}
              className="inline-flex items-center justify-center rounded-3xl px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--teal)', color: 'var(--bg-primary)' }}
            >
              {status === 'idle' && 'Send Message'}
              {status === 'submitting' && 'Sending...'}
              {status === 'success' && 'Message Sent'}
            </button>
          </div>

          {status === 'success' && (
            <p className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--success)', border: '1px solid var(--border)' }}>
              Thanks! Your message has been sent.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
