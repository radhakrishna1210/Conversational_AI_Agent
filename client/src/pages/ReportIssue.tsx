import { useState } from 'react';

export default function ReportIssue() {
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
    <>
      <div className="page-hero">
        <div className="container">
          <h1>Report Issue</h1>
          <p>Tell us what went wrong and attach a screenshot if you have one.</p>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: '80px' }}>
        <div className="form-card">
          <form onSubmit={handleSubmit}>
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
            </div>

            <div style={{ marginTop: '28px' }}>
              <button type="submit" className="btn btn-primary" disabled={status !== 'idle'}>
                {status === 'idle' && 'Submit Issue'}
                {status === 'submitting' && 'Submitting...'}
                {status === 'success' && 'Submitted'}
              </button>
            </div>

            {status === 'success' && (
              <p className="form-note" style={{ marginTop: '24px', color: 'var(--success)' }}>
                Thank you — your issue has been submitted.
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
