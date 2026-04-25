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
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">Get in touch</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Contact Us</h1>
          <p className="mt-4 text-slate-600">Fill out the form below and we’ll get back to you shortly.</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">Name</label>
            <div className="mt-2">
              <input
                id="name"
                name="name"
                type="text"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-slate-700">Message</label>
            <div className="mt-2">
              <textarea
                id="message"
                name="message"
                rows={6}
                required
                className="block w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="Let us know how we can help."
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={status !== 'idle'}
              className="inline-flex items-center justify-center rounded-3xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'idle' && 'Send Message'}
              {status === 'submitting' && 'Sending...'}
              {status === 'success' && 'Message Sent'}
            </button>
          </div>

          {status === 'success' && (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              Thanks! Your message has been sent.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
