import { useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export default function ReportIssue() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const form = e.currentTarget;
    const issueTitle = (form.elements.namedItem('issueTitle') as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim();

    try {
      const res = await fetch(`${API_BASE}/report-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueTitle, description }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setStatus('success');
      formRef.current?.reset();
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <h1>Report Issue</h1>
          <p>Tell us what went wrong and attach a screenshot if you have one.</p>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: '80px' }}>
        <div className="form-card">
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="issueTitle" className="form-label">Issue Title</label>
              <input
                id="issueTitle"
                name="issueTitle"
                type="text"
                placeholder="Example: Unable to save campaign settings"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description" className="form-label">Description</label>
              <textarea
                id="description"
                name="description"
                rows={6}
                placeholder="Describe the issue and steps to reproduce it."
                className="form-textarea"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="screenshot" className="form-label">Screenshot (optional)</label>
              <input
                id="screenshot"
                name="screenshot"
                type="file"
                accept="image/*"
                className="form-input"
              />
              <p className="form-note" style={{ marginTop: '6px' }}>
                Screenshot upload coming soon — for now please describe what you saw.
              </p>
            </div>

            <div style={{ marginTop: '28px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? 'Submitting…' : 'Submit Issue'}
              </button>
            </div>

            {status === 'success' && (
              <p className="form-note" style={{ marginTop: '24px', color: 'var(--success)' }}>
                Thank you — your issue has been submitted successfully.
              </p>
            )}

            {status === 'error' && (
              <p className="form-note" style={{ marginTop: '24px', color: 'var(--danger, #e53e3e)' }}>
                {errorMsg}
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
