import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

// Must match the limits enforced in reportIssue.controller.js — rejecting here
// saves the user an 8 MB upload that the server was always going to refuse.
const MAX_SCREENSHOT_MB = 8;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export default function ReportIssue() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object URLs are held by the browser until explicitly released.
  useEffect(() => {
    if (!screenshot) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshot);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setErrorMsg('');
    if (!file) { setScreenshot(null); return; }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Screenshot must be a PNG, JPEG, GIF or WebP image.');
      setStatus('error');
      e.target.value = '';
      setScreenshot(null);
      return;
    }
    if (file.size > MAX_SCREENSHOT_MB * 1024 * 1024) {
      setErrorMsg(`Screenshot must be ${MAX_SCREENSHOT_MB} MB or smaller.`);
      setStatus('error');
      e.target.value = '';
      setScreenshot(null);
      return;
    }
    setStatus('idle');
    setScreenshot(file);
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    const input = formRef.current?.elements.namedItem('screenshot') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const form = e.currentTarget;
    const issueTitle = (form.elements.namedItem('issueTitle') as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim();

     
    if (!issueTitle) {
  setErrorMsg('Issue title is required.');
  setStatus('error');
  return;
}

if (issueTitle.length < 5) {
  setErrorMsg(
    'Issue title must be at least 5 characters long.'
  );
  setStatus('error');
  return;
}

if (!description) {
  setErrorMsg('Description is required.');
  setStatus('error');
  return;
}

if (description.length < 20) {
  setErrorMsg(
    'Please provide a detailed description (minimum 20 characters).'
  );
  setStatus('error');
  return;
}

    try {
      // multipart, so the screenshot travels with the report in one request.
      // Content-Type is deliberately NOT set: the browser must add the
      // multipart boundary itself, and setting it by hand breaks parsing.
      const body = new FormData();
      body.append('issueTitle', issueTitle);
      body.append('description', description);
      if (screenshot) body.append('screenshot', screenshot);

      const res = await fetch(`${API_BASE}/report-issue`, { method: 'POST', body });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setStatus('success');
      formRef.current?.reset();
      setScreenshot(null);
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
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="form-input"
                onChange={handleFileChange}
              />
              <p className="form-note" style={{ marginTop: '6px' }}>
                PNG, JPEG, GIF or WebP, up to {MAX_SCREENSHOT_MB} MB. It is visible only to our
                support team, so avoid including anything you would not share with us.
              </p>

              {previewUrl && screenshot && (
                <div style={{ marginTop: '12px' }}>
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', display: 'block' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                    <span className="form-note" style={{ margin: 0 }}>
                      {screenshot.name} · {(screenshot.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={clearScreenshot}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--danger, #e53e3e)', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
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
