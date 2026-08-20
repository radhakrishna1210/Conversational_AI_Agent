import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { whapi, getAuth } from '../lib/whapi';

interface ClonedVoice {
  id: string;
  name: string;
  gender: string | null;
  language: string | null;
  description: string | null;
  status: string;
  hasSample: boolean;
  clonedProvider: string | null;
  providerLabel: string | null;
  ttsModel: string | null;
  createdAt: string;
}

/**
 * The provider that trains a clone is the provider that speaks it on every
 * later call, so it is also the provider that gets billed for those minutes.
 * The backend resolves it (key present + enabled in Super Admin → Models);
 * this page only reports the answer, so the two can never disagree.
 */
interface CloneProvider {
  id: string;
  label: string;
  ttsModel: string;
  configured: boolean;
  enabled: boolean;
  usable: boolean;
  active: boolean;
  unavailableReason: string | null;
}

interface CloneProviderInfo {
  active: { id: string; label: string; ttsModel: string } | null;
  source: 'env' | 'default' | null;
  providers: CloneProvider[];
}

const MIN_SECONDS = 20;
const MAX_FILE_MB = 10;

export default function CloneVoice() {
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');

  // Sample state (from either tab)
  const [sample, setSample] = useState<Blob | null>(null);
  const [sampleName, setSampleName] = useState('');
  const [sampleDuration, setSampleDuration] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Female');
  const [language, setLanguage] = useState('English');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Which provider/model the next clone will use. The list comes from the
  // backend resolver, so an option is never offered that the upload would then
  // refuse — and the default is exactly what it would have chosen anyway.
  const [providerInfo, setProviderInfo] = useState<CloneProviderInfo | null>(null);
  const [cloneProvider, setCloneProvider] = useState('');

  // Cloned voices list
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadVoices = async () => {
    try {
      setLoadingList(true);
      const res = await whapi.get<{ voices: ClonedVoice[] }>('/voices/cloned');
      setVoices(res?.voices ?? []);
    } catch (err) {
      console.error('Failed to load cloned voices', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadVoices();
    whapi
      .get<CloneProviderInfo>('/voices/clone/providers')
      .then((info) => {
        setProviderInfo(info);
        setCloneProvider(info?.active?.id ?? '');
      })
      .catch(() => setProviderInfo(null)); // field simply stays hidden
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopTimer();
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const setNewSample = (blob: Blob, label: string, duration: number | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSample(blob);
    setSampleName(label);
    setSampleDuration(duration);
    setPreviewUrl(URL.createObjectURL(blob));
  };

  // ── Recording ────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setNewSample(blob, `Recording (${formatTime(elapsedRef.current)})`, elapsedRef.current);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        setElapsed((s) => { elapsedRef.current = s + 1; return s + 1; });
      }, 1000);
    } catch {
      toast.error('Microphone access was denied. Allow mic access or upload a file instead.');
    }
  };

  const elapsedRef = useRef(0);

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    stopTimer();
  };

  // ── Upload ───────────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    if (!/audio\/(mpeg|mp3|wav|x-wav|wave|webm|ogg|mp4|x-m4a|aac)/.test(file.type) && !/\.(mp3|wav|webm|ogg|m4a)$/i.test(file.name)) {
      toast.error('Please choose an audio file (MP3, WAV, WEBM, OGG, M4A).');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large — maximum ${MAX_FILE_MB}MB.`);
      return;
    }
    // Measure duration for validation
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const dur = isFinite(probe.duration) ? Math.round(probe.duration) : null;
      URL.revokeObjectURL(url);
      setNewSample(file, file.name, dur);
      if (dur !== null && dur < MIN_SECONDS) {
        toast.warning(`Sample is ${dur}s — at least ${MIN_SECONDS}s of clear speech is recommended.`);
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setNewSample(file, file.name, null);
    };
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!sample) { toast.error('Record or upload an audio sample first.'); return; }
    if (!name.trim()) { toast.error('Give your voice a name.'); return; }
    if (sampleDuration !== null && sampleDuration < MIN_SECONDS) {
      toast.error(`Your sample is only ${sampleDuration}s. Please provide at least ${MIN_SECONDS} seconds.`);
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      const ext = sample.type.includes('wav') ? 'wav' : sample.type.includes('mpeg') ? 'mp3' : 'webm';
      form.append('sample', sample, sampleName.includes('.') ? sampleName : `sample.${ext}`);
      form.append('name', name.trim());
      form.append('gender', gender);
      form.append('language', language);
      if (cloneProvider) form.append('cloneProvider', cloneProvider);
      if (description.trim()) form.append('description', description.trim());

      const res = await whapi.postForm<{ success: boolean; message?: string }>('/voices/clone', form);
      toast.success(res?.message || 'Voice sample saved.');

      // Reset form
      setSample(null); setSampleName(''); setSampleDuration(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      setName(''); setDescription('');
      loadVoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save voice sample.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Playback / delete of cloned voices ──────────────────────────────────
  const playSample = async (voice: ClonedVoice) => {
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingId(voice.id);
    try {
      const { token, workspaceId } = getAuth();
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/voices/cloned/${voice.id}/sample`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load sample');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      setPlayingId(null);
      toast.error('Playback failed.');
    }
  };

  const deleteVoice = async (voice: ClonedVoice) => {
    const extra = voice.clonedProvider
      ? ` The trained clone will also be removed from ${voice.clonedProvider}.`
      : '';
    if (!confirm(`Delete "${voice.name}" and its uploaded sample?${extra} This cannot be undone.`)) return;
    setBusyId(voice.id);
    try {
      const res = await whapi.del<{ message?: string; remoteError?: string | null }>(
        `/voices/cloned/${voice.id}`
      );
      // The row is gone locally either way, but say so plainly when the copy at
      // the cloning provider survived — otherwise people believe it is gone.
      if (res?.remoteError) toast.warning(res.message ?? 'Deleted, but the provider copy remains.');
      else toast.success('Voice deleted.');
      setVoices((prev) => prev.filter((v) => v.id !== voice.id));
      if (playingId === voice.id) { audioRef.current?.pause(); setPlayingId(null); }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete voice.');
    } finally {
      setBusyId(null);
    }
  };

  /** Drop the raw recording but keep the trained clone working. */
  const deleteSample = async (voice: ClonedVoice) => {
    if (!confirm(`Delete the uploaded sample for "${voice.name}"? The cloned voice keeps working, but you lose the preview.`)) return;
    setBusyId(voice.id);
    try {
      await whapi.del(`/voices/cloned/${voice.id}/sample`);
      toast.success('Uploaded sample deleted.');
      setVoices((prev) => prev.map((v) => (v.id === voice.id ? { ...v, hasSample: false } : v)));
      if (playingId === voice.id) { audioRef.current?.pause(); setPlayingId(null); }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete the sample.');
    } finally {
      setBusyId(null);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const tabBtn = (tab: 'record' | 'upload', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      className={`rz-tab${activeTab === tab ? ' is-active' : ''}`}
      onClick={() => setActiveTab(tab)}
    >
      {label}
    </button>
  );

  return (
    <div className="rz-page rz-page-pad rz-bleed">
     <div className="rz-wrap">
      <div className="rz-head">
        <div>
          <div className="rz-eyebrow">Voice lab</div>
          <h1 className="rz-h1">Clone a voice</h1>
          <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 620 }}>
            Build a custom voice from a recording. {MIN_SECONDS} seconds is the minimum;
            30–60 seconds of clear speech gives a noticeably better clone.
          </p>
        </div>
      </div>

      <div className="rz-card rz-card-lg" style={{ marginBottom: '22px' }}>
        <div className="rz-title" style={{ fontSize: 17 }}>Record or upload a sample</div>
        <p className="rz-sub" style={{ margin: '6px 0 18px' }}>
          Speak clearly with minimal background noise. The clone reproduces whatever it hears, room tone included.
        </p>

        <div className="rz-tabs" style={{ marginBottom: '20px' }}>
          {tabBtn('record', 'Record')}
          {tabBtn('upload', 'Upload file')}
        </div>

        {activeTab === 'record' && (
          <div
            onClick={recording ? stopRecording : startRecording}
            style={{
              border: `1.5px dashed ${recording ? 'var(--err)' : 'var(--line-2)'}`,
              borderRadius: '16px', padding: '44px 24px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', background: 'var(--bg-2)', marginBottom: '20px', cursor: 'pointer',
              transition: 'border-color .15s ease',
            }}
          >
            {/* The mark pulses only while recording — a live indicator, not decoration. */}
            <div
              className={`rz-mark rz-mark-lg ${recording ? '' : ''}`}
              style={{
                width: 52, height: 52, borderRadius: 14, marginBottom: 16,
                background: recording ? 'rgba(248,113,113,0.14)' : 'rgba(14,179,158,0.1)',
                color: recording ? 'var(--err)' : 'var(--cyan-fg)',
              }}
            >
              {recording
                ? <span className="rz-dot rz-dot-err rz-dot-live" style={{ width: 14, height: 14 }} />
                : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                )}
            </div>
            <div className="rz-title-lg" style={{ fontSize: 17 }}>
              {recording ? `Recording… ${formatTime(elapsed)} — click to stop` : 'Click to start recording'}
            </div>
            <p className="rz-sub" style={{ margin: '6px 0 20px' }}>
              Speak clearly · at least {MIN_SECONDS} seconds
            </p>
            <div className="rz-cluster" style={{ gap: 20, justifyContent: 'center' }}>
              <span className="rz-mono-xs">Quiet room</span>
              <span className="rz-mono-xs">15–30 cm away</span>
              <span className="rz-mono-xs">Normal pace</span>
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            style={{
              border: '1px dashed var(--line)', borderRadius: '8px', padding: '60px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'rgba(0,0,0,0.15)', marginBottom: '24px', cursor: 'pointer',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>☁️</div>
            <p style={{ color: 'var(--tx)', fontWeight: 600, marginBottom: '8px' }}>Click to upload or drag and drop</p>
            <p style={{ color: 'var(--tx-3)', fontSize: '13px' }}>MP3, WAV up to {MAX_FILE_MB}MB</p>
          </div>
        )}

        {sample && previewUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '24px',
            background: 'rgba(0,212,200,0.05)',
          }}>
            <span style={{ fontSize: '18px' }}>🎧</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--tx)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sampleName}</div>
              <div style={{ color: 'var(--tx-3)', fontSize: '12px' }}>
                {sampleDuration !== null ? `${sampleDuration}s` : 'Duration unknown'}
                {sampleDuration !== null && sampleDuration < MIN_SECONDS && (
                  <span style={{ color: 'var(--warn)' }}> — too short, aim for {MIN_SECONDS}s+</span>
                )}
              </div>
            </div>
            <audio controls src={previewUrl} style={{ height: '32px', maxWidth: '220px' }} />
            <button
              onClick={() => { setSample(null); setSampleName(''); setSampleDuration(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}
              style={{ background: 'transparent', border: 'none', color: 'var(--tx-3)', cursor: 'pointer', fontSize: '16px' }}
              title="Remove sample"
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '8px' }}>Voice Name *</label>
            <input
              type="text" className="form-input" placeholder="e.g. My Professional Voice"
              value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '8px' }}>Gender *</label>
            <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}>
              <option>Female</option>
              <option>Male</option>
              <option>Neutral</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '8px' }}>Language *</label>
            <select className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}>
              <option>English</option>
              <option>Hindi</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Tamil</option>
              <option>Telugu</option>
              <option>Kannada</option>
            </select>
          </div>
          {/* The provider that trains this voice is the provider that speaks it
              on every later call, so this choice is also what the TTS bill is
              priced on. Hidden entirely when the backend could not be reached —
              better no field than a guessed one. */}
          {providerInfo && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '8px' }}>
                TTS Provider *
              </label>
              <select
                className="form-select"
                value={cloneProvider}
                onChange={(e) => setCloneProvider(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}
              >
                {providerInfo.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.usable}>
                    {p.label} · {p.ttsModel}
                    {p.usable ? '' : ` — ${p.unavailableReason ?? 'unavailable'}`}
                  </option>
                ))}
              </select>
              <p style={{ color: 'var(--tx-3)', fontSize: '12px', margin: '6px 0 0' }}>
                {providerInfo.active
                  ? 'Trains the clone and runs the TTS on every call that uses it — this is the model the TTS cost is priced on.'
                  : 'No cloning provider is available, so the sample will be saved for preview only and cannot speak new text.'}
              </p>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '8px' }}>
              Description <span style={{ color: 'var(--tx-3)', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              className="form-input" placeholder="Describe this voice or its intended use..."
              value={description} onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', minHeight: '80px', resize: 'vertical' }}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px', opacity: submitting ? 0.7 : 1 }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          <span style={{ marginRight: '6px' }}>🎙️</span>
          {submitting ? 'Saving…' : 'Clone Voice'}
        </button>
      </div>

      {/* Cloned voices list */}
      <div className="rz-card rz-card-lg" style={{ padding: voices.length ? 22 : 0 }}>
        {loadingList ? (
          <p style={{ color: 'var(--tx-3)', textAlign: 'center' }}>Loading your voices…</p>
        ) : voices.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'var(--tx-3)', marginBottom: '16px', fontSize: '32px' }}>🎙️</div>
            <h3 className="rz-empty-title" style={{ marginBottom: '8px' }}>No cloned voices yet</h3>
            <p style={{ color: 'var(--tx-2)', fontSize: '14px' }}>
              Upload your first audio sample above to create a custom AI voice.
            </p>
          </div>
        ) : (
          <>
            <div className="rz-title" style={{ fontSize: 16, marginBottom: '16px' }}>Your cloned voices ({voices.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {voices.map((v) => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px', border: '1px solid var(--line)', borderRadius: '8px',
                }}>
                  <button
                    onClick={() => playSample(v)}
                    disabled={!v.hasSample}
                    title={!v.hasSample ? 'Sample deleted — nothing to preview' : playingId === v.id ? 'Stop' : 'Play sample'}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      cursor: v.hasSample ? 'pointer' : 'not-allowed',
                      opacity: v.hasSample ? 1 : 0.4,
                      border: '1px solid var(--line)', background: 'rgba(0,212,200,0.08)',
                      color: playingId === v.id ? 'var(--err)' : 'var(--cyan)', fontSize: '14px',
                    }}
                  >
                    {playingId === v.id ? '■' : '▶'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--tx)', fontWeight: 600, fontSize: '14px' }}>{v.name}</div>
                    <div style={{ color: 'var(--tx-3)', fontSize: '12px' }}>
                      {[v.gender, v.language].filter(Boolean).join(' • ')}
                      {v.description ? ` — ${v.description}` : ''}
                    </div>
                    {/* The provider/model this specific clone is billed on. It
                        is fixed at clone time: the id only exists upstream. */}
                    {v.providerLabel && (
                      <div style={{ color: 'var(--tx-3)', fontSize: '11px', marginTop: '3px' }}>
                        Speaks via <span style={{ color: 'var(--tx-2)' }}>{v.providerLabel}</span>
                        {v.ttsModel && (
                          <span style={{ fontFamily: 'ui-monospace, monospace' }}> · {v.ttsModel}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                    background: v.status === 'cloned' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                    color: v.status === 'cloned' ? 'var(--lime)' : 'var(--warn)',
                    border: `1px solid ${v.status === 'cloned' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}>
                    {v.status === 'cloned' ? 'Cloned' : 'Sample saved'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {/* Only offered on a real clone: for a sample-only voice the
                        recording IS the voice, so this would just break it. */}
                    {v.status === 'cloned' && v.hasSample && (
                      <button
                        onClick={() => deleteSample(v)}
                        disabled={busyId === v.id}
                        title="Delete only the uploaded recording — the cloned voice keeps working"
                        style={{
                          padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          border: '1px solid var(--line)', background: 'transparent',
                          color: 'var(--tx-2)', cursor: busyId === v.id ? 'wait' : 'pointer',
                        }}
                      >
                        Delete sample
                      </button>
                    )}
                    <button
                      onClick={() => deleteVoice(v)}
                      disabled={busyId === v.id}
                      title="Delete this voice and its uploaded sample"
                      style={{
                        padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
                        color: 'var(--err)', cursor: busyId === v.id ? 'wait' : 'pointer',
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
     </div>
    </div>
  );
}
