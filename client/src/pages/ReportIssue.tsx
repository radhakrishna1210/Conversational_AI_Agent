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
    <div className="rz-page" style={{ padding: '48px 24px 80px' }}>
      <div className="rz-wrap" style={{ maxWidth: 680 }}>
        <div className="rz-eyebrow">Support</div>
        <h1 className="rz-h1" style={{ fontSize: 'clamp(26px, 3vw, 38px)', margin: '10px 0 6px' }}>
          Report an issue
        </h1>
        <p className="rz-sub-lg" style={{ margin: '0 0 22px' }}>
          Tell us what broke. Include the steps if you can — it goes straight to on-call.
        </p>

        <div className="rz-card rz-card-lg" style={{ borderRadius: 18 }}>
          <form ref={formRef} onSubmit={handleSubmit} className="rz-stack" style={{ gap: 16 }}>
            <div className="rz-field">
              <label htmlFor="issueTitle" className="rz-field-label">Issue title</label>
              <input
                id="issueTitle"
                name="issueTitle"
                type="text"
                placeholder="Unable to save campaign settings"
                className="rz-input"
                required
              />
            </div>

            <div className="rz-field">
              <label htmlFor="description" className="rz-field-label">What happened?</label>
              <textarea
                id="description"
                name="description"
                rows={6}
                placeholder="Describe the issue and the steps to reproduce it."
                className="rz-textarea"
                required
              />
            </div>

            <div className="rz-field">
              <label htmlFor="screenshot" className="rz-field-label">
                Screenshot <span className="rz-muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="screenshot"
                name="screenshot"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="rz-input"
                style={{ padding: 9 }}
                onChange={handleFileChange}
              />
              <div className="rz-field-hint">
                PNG, JPEG, GIF or WebP, up to {MAX_SCREENSHOT_MB} MB. Visible only to our support
                team — avoid anything you would not want to share with us.
              </div>

              {previewUrl && screenshot && (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 10, border: '1px solid var(--line-2)', display: 'block' }}
                  />
                  <div className="rz-cluster-sm" style={{ marginTop: 8 }}>
                    <span className="rz-mono-xs">
                      {screenshot.name} · {(screenshot.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={clearScreenshot}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--err)', cursor: 'pointer', fontSize: 12.5 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {status === 'success' && (
              <div
                className="rz-enter"
                style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, padding: '11px 13px', color: 'var(--lime)', fontSize: 13 }}
              >
                Thank you — your report is with on-call.
              </div>
            )}

            {status === 'error' && (
              <div
                style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '11px 13px', color: 'var(--err)', fontSize: 13 }}
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="rz-btn rz-btn-primary"
              style={{ alignSelf: 'flex-start', padding: '12px 22px', fontSize: 14.5 }}
              disabled={status === 'submitting'}
            >
              {status === 'submitting'
                ? <><span className="rz-spinner" style={{ borderTopColor: 'var(--on-cyan)' }} /> Submitting…</>
                : 'Submit issue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
