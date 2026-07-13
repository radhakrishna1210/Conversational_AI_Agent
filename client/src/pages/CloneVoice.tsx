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
  createdAt: string;
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

  // Cloned voices list
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
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
    if (!confirm(`Delete "${voice.name}"? This cannot be undone.`)) return;
    try {
      await whapi.del(`/voices/cloned/${voice.id}`);
      toast.success('Voice deleted.');
      setVoices((prev) => prev.filter((v) => v.id !== voice.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete voice.');
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const tabBtn = (tab: 'record' | 'upload', label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)',
        background: activeTab === tab ? '#111827' : 'transparent', color: 'var(--text-primary)',
        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Clone Voice</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Create custom AI voices by uploading audio samples. Minimum {MIN_SECONDS} seconds, recommended 30-60 seconds of clear speech.
        </p>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '32px', background: 'rgba(255,255,255,0.01)', marginBottom: '32px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px' }}>🎙️</span> Clone Your Voice
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
          Upload an audio sample or record directly from your microphone. Speak clearly with minimal background noise for best results.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {tabBtn('record', '🎙️ Record')}
          {tabBtn('upload', '☁️ Upload File')}
        </div>

        {activeTab === 'record' && (
          <div
            onClick={recording ? stopRecording : startRecording}
            style={{
              border: recording ? '1px dashed #ef4444' : '1px dashed var(--border)',
              borderRadius: '8px', padding: '48px 24px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', background: 'rgba(0,0,0,0.15)', marginBottom: '24px', cursor: 'pointer',
            }}
          >
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: recording ? 'rgba(239,68,68,0.15)' : 'rgba(0, 212, 200, 0.1)',
              border: recording ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(0, 212, 200, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: recording ? '#ef4444' : 'var(--teal)', marginBottom: '16px', fontSize: '20px',
            }}>
              {recording ? '⏺' : '🎙️'}
            </div>
            <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              {recording ? `Recording… ${formatTime(elapsed)} — click to stop` : 'Click to start recording'}
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
              Speak clearly • at least {MIN_SECONDS} seconds
            </p>
            <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>🤫 Quiet room</span>
              <span>📏 15-30 cm away</span>
              <span>🗣️ Normal pace</span>
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            style={{
              border: '1px dashed var(--border)', borderRadius: '8px', padding: '60px 24px',
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
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>Click to upload or drag and drop</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>MP3, WAV up to {MAX_FILE_MB}MB</p>
          </div>
        )}

        {sample && previewUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '24px',
            background: 'rgba(0,212,200,0.05)',
          }}>
            <span style={{ fontSize: '18px' }}>🎧</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sampleName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {sampleDuration !== null ? `${sampleDuration}s` : 'Duration unknown'}
                {sampleDuration !== null && sampleDuration < MIN_SECONDS && (
                  <span style={{ color: '#f59e0b' }}> — too short, aim for {MIN_SECONDS}s+</span>
                )}
              </div>
            </div>
            <audio controls src={previewUrl} style={{ height: '32px', maxWidth: '220px' }} />
            <button
              onClick={() => { setSample(null); setSampleName(''); setSampleDuration(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}
              title="Remove sample"
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Voice Name *</label>
            <input
              type="text" className="form-input" placeholder="e.g. My Professional Voice"
              value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Gender *</label>
            <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}>
              <option>Female</option>
              <option>Male</option>
              <option>Neutral</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Language *</label>
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
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
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
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: voices.length ? '24px' : '48px', background: 'rgba(255,255,255,0.01)' }}>
        {loadingList ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading your voices…</p>
        ) : voices.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '32px' }}>🎙️</div>
            <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>No Cloned Voices Yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Upload your first audio sample above to create a custom AI voice.
            </p>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Your Cloned Voices ({voices.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {voices.map((v) => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px', border: '1px solid var(--border)', borderRadius: '8px',
                }}>
                  <button
                    onClick={() => playSample(v)}
                    title={playingId === v.id ? 'Stop' : 'Play sample'}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'rgba(0,212,200,0.08)',
                      color: playingId === v.id ? '#ef4444' : 'var(--teal)', fontSize: '14px',
                    }}
                  >
                    {playingId === v.id ? '■' : '▶'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>{v.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {[v.gender, v.language].filter(Boolean).join(' • ')}
                      {v.description ? ` — ${v.description}` : ''}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                    background: v.status === 'cloned' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                    color: v.status === 'cloned' ? '#22c55e' : '#f59e0b',
                    border: `1px solid ${v.status === 'cloned' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}>
                    {v.status === 'cloned' ? 'Cloned' : 'Sample saved'}
                  </span>
                  <button
                    onClick={() => deleteVoice(v)}
                    title="Delete voice"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '15px' }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
