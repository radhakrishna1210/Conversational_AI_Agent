/**
 * Where a broadcast's audio comes from.
 *
 * Three ways in, because customers arrive with the message in three different
 * states: a file their agency produced, a script they want spoken, or nothing
 * but a microphone and thirty seconds. All three converge on one object — a
 * recording with a known duration, which is what the whole feature is priced on.
 */
import { useEffect, useRef, useState } from 'react';
import {
  listRecordings, uploadRecording, synthesizeRecording, deleteRecording,
  recordingObjectUrl, mmss,
  type BroadcastRecording,
} from '@/lib/broadcastApi';
import { whapi } from '@/lib/whapi';
import { toTelephonyWav, probeDuration } from '@/lib/wavEncoder';

type Voice = { id: string; name: string; provider: string | null; language?: string | null; gender?: string | null };

type Tab = 'upload' | 'record' | 'text';

/** Long enough that people hang up, and every second is billed on every answered call. */
const SOFT_LIMIT_SEC = 60;

export default function RecordingStudio({ onChanged }: { onChanged?: () => void }) {
  const [recordings, setRecordings] = useState<BroadcastRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('upload');
  const [name, setName] = useState('');

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState(0);

  // record
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; durationSec: number; url: string } | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  // text-to-speech
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [script, setScript] = useState('');

  // playback of a saved recording
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRecordings(await listRecordings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recordings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab !== 'text' || voices.length) return;
    whapi.get<{ voices: Voice[] }>('/voices?limit=100')
      .then((r) => {
        setVoices(r.voices ?? []);
        if (!voiceId && r.voices?.length) setVoiceId(r.voices[0].id);
      })
      .catch(() => setVoices([]));
  }, [tab]);

  // Blob URLs are a leak if they outlive the element pointing at them, and a
  // studio churns through them a take at a time. Two effects, not one: a single
  // cleanup keyed on both would revoke the take's URL every time the library
  // player changed — pulling the audio out from under a take still on screen.
  useEffect(() => () => { if (playingUrl) URL.revokeObjectURL(playingUrl); }, [playingUrl]);
  useEffect(() => () => { if (take?.url) URL.revokeObjectURL(take.url); }, [take?.url]);

  // ── mic ──
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          // MediaRecorder gives WebM/Opus or MP4/AAC; a phone line plays
          // neither. Converted here so what is uploaded is what will be dialled.
          const raw = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' });
          const wav = await toTelephonyWav(raw);
          setTake({ ...wav, url: URL.createObjectURL(wav.blob) });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not process that recording');
        }
      };
      rec.start();
      mediaRecorder.current = rec;
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError('Microphone access was refused. Allow it in your browser, or upload a file instead.');
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current = null;
    setRecording(false);
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  };

  // ── save ──
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (tab === 'upload') {
        if (!file) throw new Error('Choose an MP3 or WAV file');
        await uploadRecording(file, name || file.name.replace(/\.[^.]+$/, ''), fileDuration);
      } else if (tab === 'record') {
        if (!take) throw new Error('Record something first');
        await uploadRecording(take.blob, name || 'Studio recording', take.durationSec);
      } else {
        if (!script.trim()) throw new Error('Write the message you want spoken');
        if (!voiceId) throw new Error('Pick a voice');
        await synthesizeRecording({ name: name || undefined, text: script, voiceId });
      }
      setName(''); setFile(null); setFileDuration(0); setScript('');
      if (take?.url) URL.revokeObjectURL(take.url);
      setTake(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that recording');
    } finally {
      setBusy(false);
    }
  };

  const play = async (id: string) => {
    if (playingId === id) { setPlayingId(null); setPlayingUrl(null); return; }
    try {
      const url = await recordingObjectUrl(id);
      setPlayingUrl(url);
      setPlayingId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play that recording');
    }
  };

  const remove = async (r: BroadcastRecording) => {
    if (!window.confirm(`Delete "${r.name}"? Broadcasts that already played it keep working.`)) return;
    try {
      await deleteRecording(r.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that recording');
    }
  };

  const currentDuration = tab === 'upload' ? fileDuration : tab === 'record' ? (take?.durationSec ?? elapsed) : 0;
  const tooLong = currentDuration > SOFT_LIMIT_SEC;

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* ── Create ── */}
      <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: 'var(--s1)', padding: '18px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {([
            ['upload', 'Upload a file'],
            ['record', 'Record now'],
            ['text', 'Type a script'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`rz-btn rz-btn-sm ${tab === key ? 'rz-btn-primary' : 'rz-btn-secondary'}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
            Recording name
            <input
              className="rz-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali offer — Hindi"
            />
          </label>

          {tab === 'upload' && (
            <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
              Audio file (MP3 or WAV)
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setFileDuration(f ? await probeDuration(f) : 0);
                }}
                className="rz-input"
              />
              {file && (
                <span className="rz-mono" style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                  {fileDuration ? ` · ${mmss(fileDuration)}` : ''}
                </span>
              )}
            </label>
          )}

          {tab === 'record' && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {!recording ? (
                  <button className="rz-btn rz-btn-primary rz-btn-sm" onClick={startRecording}>
                    ● Start recording
                  </button>
                ) : (
                  <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={stopRecording}>
                    ■ Stop ({mmss(elapsed)})
                  </button>
                )}
                {take && !recording && (
                  <span className="rz-mono" style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                    Take: {mmss(take.durationSec)} · 8 kHz mono WAV
                  </span>
                )}
              </div>
              {take && <audio controls src={take.url} style={{ width: '100%' }} />}
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--tx-3)' }}>
                Recorded in your browser and converted to 8 kHz mono — the format a phone line
                actually carries. Speak as you would on a call.
              </p>
            </div>
          )}

          {tab === 'text' && (
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Voice
                <select className="rz-input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {voices.length === 0 && <option value="">Loading voices…</option>}
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.provider}{v.language ? ` (${v.language})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '7px', color: 'var(--tx-2)', fontSize: '13px' }}>
                Message
                <textarea
                  className="rz-input"
                  rows={4}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Namaste! This is a reminder from…"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--tx-3)' }}>
                  {script.length} characters · spoken once now and stored, so no speech is generated
                  during the calls.
                </span>
              </label>
            </div>
          )}

          {tooLong && (
            <div style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px',
              background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.35)', color: 'var(--tx)' }}>
              This is {mmss(currentDuration)} long. Every second is billed on every call that answers,
              and most people hang up inside 20 seconds — consider trimming it.
            </div>
          )}

          <div>
            <button className="rz-btn rz-btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : tab === 'text' ? 'Generate & save' : 'Save recording'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── Library ── */}
      <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: 'var(--s1)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', fontSize: '13px', fontWeight: 600 }}>
          Saved recordings {recordings.length > 0 && <span style={{ color: 'var(--tx-3)', fontWeight: 400 }}>({recordings.length})</span>}
        </div>
        {loading ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--tx-3)', fontSize: '13px' }}>Loading…</div>
        ) : recordings.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--tx-3)', fontSize: '13px' }}>
            No recordings yet. Upload one, record one, or type a script above.
          </div>
        ) : (
          <div>
            {recordings.map((r) => (
              <div
                key={r.id}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 18px',
                  borderTop: '1px solid var(--line)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{r.name}</div>
                  <div className="rz-mono" style={{ fontSize: '11.5px', color: 'var(--tx-3)', marginTop: '3px' }}>
                    {mmss(r.durationSec)} · {r.source === 'TTS' ? 'generated' : 'uploaded'} ·{' '}
                    {(r.sizeBytes / 1024).toFixed(0)} KB
                  </div>
                  {r.scriptText && (
                    <div style={{ fontSize: '12px', color: 'var(--tx-2)', marginTop: '4px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '520px' }}>
                      “{r.scriptText}”
                    </div>
                  )}
                </div>
                <button className="rz-btn rz-btn-secondary rz-btn-sm" onClick={() => play(r.id)}>
                  {playingId === r.id ? 'Hide player' : 'Listen'}
                </button>
                <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={() => remove(r)}>Delete</button>
              </div>
            ))}
            {playingId && playingUrl && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', background: 'var(--s2)' }}>
                <audio controls autoPlay src={playingUrl} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
