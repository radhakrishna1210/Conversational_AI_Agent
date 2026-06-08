import { DragEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const steps = [
  { title: 'Campaign & Phone Number', subtitle: 'Name and source number' },
  { title: 'Upload Contact List', subtitle: 'Add your CSV audience' },
  { title: 'Campaign Settings', subtitle: 'Set call limits and details' },
  { title: 'Review & Create', subtitle: 'Confirm before launching' },
];

type BulkCallForm = {
  campaignName: string;
  phoneNumber: string;
  file: File | null;
  concurrentCalls: number;
  description: string;
};

export default function BulkCallCreate() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<BulkCallForm>({
    campaignName: '',
    phoneNumber: '',
    file: null,
    concurrentCalls: 1,
    description: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const phoneNumbers: string[] = [];

  const canProceed = useMemo(() => {
    if (currentStep === 0) {
      return form.campaignName.trim().length > 0;
    }
    if (currentStep === 1) {
      return form.file !== null;
    }
    if (currentStep === 2) {
      return form.concurrentCalls > 0;
    }
    return true;
  }, [currentStep, form]);

  const stepLabel = `${currentStep + 1} / ${steps.length}`;

  const updateField = (field: keyof BulkCallForm, value: string | number | File | null) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError(null);
  };

  const handleNext = () => {
    if (currentStep === 0 && !form.campaignName.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (currentStep === 1 && !form.file) {
      setError('CSV file is required.');
      return;
    }
    if (currentStep === 2 && form.concurrentCalls <= 0) {
      setError('Concurrent call limit must be greater than 0.');
      return;
    }
    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSelectFile = (file: File | null) => {
    updateField('file', file);
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) handleSelectFile(file);
  };

  const handleCreateCampaign = () => {
    if (!form.campaignName.trim()) {
      setError('Campaign name is required.');
      setCurrentStep(0);
      return;
    }
    if (!form.file) {
      setError('CSV file is required.');
      setCurrentStep(1);
      return;
    }
    if (form.concurrentCalls <= 0) {
      setError('Concurrent call limit must be greater than 0.');
      setCurrentStep(2);
      return;
    }

    setError(null);
    setSuccessMessage('Campaign created locally. API integration can be added later.');
  };

  const fileLabel = form.file ? `${form.file.name} (${Math.round(form.file.size / 1024)} KB)` : 'No file selected yet';

  return (
    <div style={{ padding: '32px 24px 48px', maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--teal)' }}>Bulk Call</p>
          <h1 style={{ margin: '12px 0 12px', fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>Create Bulk Call Campaign</h1>
          <p style={{ maxWidth: '620px', color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.7 }}>Build your campaign in four simple steps. This prototype stores data locally and does not connect to backend services.</p>
        </div>
        <div style={{ minWidth: '180px', padding: '18px 22px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-secondary)', marginBottom: '8px' }}>{stepLabel}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{steps[currentStep].title}</div>
        </div>
      </div>

      <div style={{ marginTop: '28px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
        {steps.map((step, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div
              key={step.title}
              style={{
                padding: '16px',
                borderRadius: '16px',
                background: active ? 'rgba(18, 184, 152, 0.08)' : 'var(--bg-card)',
                border: `1px solid ${active ? 'rgba(18, 184, 152, 0.35)' : 'var(--border)'}`,
                color: active ? 'var(--teal)' : 'var(--text-secondary)',
                minHeight: '96px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{done ? 'Done' : `Step ${index + 1}`}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{step.title}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '28px', display: 'grid', gap: '24px' }}>
        {currentStep === 0 && (
          <section style={{ display: 'grid', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Campaign Details</h2>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>Name your campaign so it is easy to identify later.</p>
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>Campaign Name</label>
                <input
                  type="text"
                  value={form.campaignName}
                  onChange={(event) => updateField('campaignName', event.target.value)}
                  placeholder="Enter campaign name"
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Phone Number</h2>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>Choose the calling number for this campaign.</p>
                </div>
              </div>

              {phoneNumbers.length === 0 ? (
                <div style={{ marginTop: '18px', padding: '18px', borderRadius: '16px', border: '1px solid rgba(248, 113, 113, 0.3)', background: 'rgba(248, 113, 113, 0.1)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--error)' }}>No Phone Numbers Available</div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '13px' }}>You need to purchase a phone number and attach an agent to it before you can create a campaign. Please visit the Phone Numbers section to buy a number first.</div>
                </div>
              ) : null}

              <div style={{ marginTop: '18px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>Phone Number</label>
                <select
                  value={form.phoneNumber}
                  disabled={phoneNumbers.length === 0}
                  onChange={(event) => updateField('phoneNumber', event.target.value)}
                  className="form-input"
                  style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select a phone number</option>
                  {phoneNumbers.map((number) => (
                    <option key={number} value={number}>{number}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {currentStep === 1 && (
          <section style={{ display: 'grid', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '26px' }}>
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Upload Contact List</h2>
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>Upload a CSV with contacts for this campaign.</p>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  borderRadius: '18px',
                  border: `1px dashed ${isDragging ? 'var(--teal)' : 'var(--border)'}`,
                  padding: '28px',
                  background: isDragging ? 'rgba(18, 184, 152, 0.06)' : 'var(--bg-elevated)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Drag & drop your CSV file here</p>
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>or click to browse and upload a contact list.</p>
                <button
                  type="button"
                  onClick={() => document.getElementById('bulk-upload-input')?.click()}
                  className="btn btn-secondary"
                  style={{ marginTop: '18px' }}
                >
                  Choose File
                </button>
                <input
                  id="bulk-upload-input"
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(event) => handleSelectFile(event.target.files?.[0] ?? null)}
                />
              </div>

              <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Selected file</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>{fileLabel}</div>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', maxWidth: '420px' }}>
                  Supported format: .csv. Use one phone number column per row with headers like <code>phone</code>, <code>phoneNumber</code>, or <code>number</code>.
                </div>
              </div>
            </div>
          </section>
        )}

        {currentStep === 2 && (
          <section style={{ display: 'grid', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '26px' }}>
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Campaign Settings</h2>
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>Configure call pacing and campaign details.</p>
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>Concurrent Call Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={form.concurrentCalls}
                    onChange={(event) => updateField('concurrentCalls', Number(event.target.value))}
                    className="form-input"
                    style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Number Pool & Rotation</h3>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Add backup numbers to rotate between if one gets flagged. These settings will be applied when campaign delivery begins.</p>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>Campaign Description</label>
                  <textarea
                    rows={5}
                    value={form.description}
                    onChange={(event) => updateField('description', event.target.value)}
                    className="form-input"
                    style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', minHeight: '130px', resize: 'vertical' }}
                    placeholder="Describe what this campaign is for..."
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {currentStep === 3 && (
          <section style={{ display: 'grid', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '26px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Review & Create</h2>
              <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>Verify your campaign details before creating it locally.</p>

              <div style={{ marginTop: '24px', display: 'grid', gap: '14px' }}>
                {[
                  { label: 'Campaign Name', value: form.campaignName || 'Not set' },
                  { label: 'Phone Number', value: form.phoneNumber || 'No phone number selected' },
                  { label: 'Contact File', value: form.file ? `${form.file.name} (${Math.round(form.file.size / 1024)} KB)` : 'No file selected' },
                  { label: 'Concurrent Call Limit', value: `${form.concurrentCalls}` },
                  { label: 'Description', value: form.description || 'No description provided' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '16px 18px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{item.label}</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, textAlign: 'right' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {successMessage ? (
              <div style={{ padding: '18px 22px', borderRadius: '18px', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)', color: 'var(--success)' }}>
                {successMessage}
              </div>
            ) : null}
          </section>
        )}
      </div>

      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleBack}
          disabled={currentStep === 0}
          style={{ minWidth: '142px' }}
        >
          Back
        </button>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              disabled={!canProceed}
              style={{ minWidth: '142px' }}
            >
              Next
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/dashboard')}
                style={{ minWidth: '142px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateCampaign}
                style={{ minWidth: '142px' }}
              >
                Create Campaign
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: '16px', padding: '16px', borderRadius: '14px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--error)' }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
