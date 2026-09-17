// client/src/components/VoiceConfigModal.tsx
/**
 * Voice picker.
 *
 * One list of voices — a name, what it is made for ("Conversational · Female",
 * worked out server-side in voicePicker.voiceCategoryLabel) and a play button
 * each. There are no provider
 * tabs, provider names, gender/language filters or sync buttons: which company
 * synthesizes a voice is not the client's concern, and the server already
 * limits the list to voices that can speak this agent's language
 * (GET /voices/picker, backend services/voice/voicePicker.js). The agent's
 * current voice comes first, then this workspace's cloned voices, then the rest
 * in a stable mixed order.
 *
 * Choosing saves through PUT /agents/:agentId/voice, which stores the label the
 * runtime reads; this component only ever handles the voice's id and name.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuth } from '@/lib/authStorage';
// authFetch: the current token, plus a refresh on 401, so the picker keeps
// working after the ~15-min access token expires.
import { authFetch } from '@/lib/authFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickerVoice {
  id: string;
  name: string;
  /** Use case and gender, e.g. "Conversational · Female"; empty when unknown. */
  category?: string;
}

interface PickerPage {
  total: number;
  page: number;
  limit: number;
  voices: PickerVoice[];
  selectedId: string | null;
}

interface VoiceConfigModalProps {
  agentId: string;
  onClose: () => void;
  /** Called once the voice is stored. `label` is the stored value, `name` what to show. */
  onSaved: (voice: { id: string; name: string; label: string }) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1';
const wsBase = () => `${API_BASE}/workspaces/${getAuth().workspaceId}`;
const LIMIT = 24;
const PREVIEW_TEXT = 'Hello, thank you for calling. How can I assist you today?';

// ─── Icons ────────────────────────────────────────────────────────────────────

const SpinnerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ animation: 'voice-spin 0.8s linear infinite' }} aria-hidden="true">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
    <path d="M12 2 a10 10 0 0 1 10 10" />
  </svg>
);

const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="6,3 20,12 6,21" />
  </svg>
);

const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx-3)" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceConfigModal({ agentId, onClose, onSaved }: VoiceConfigModalProps) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [voices, setVoices] = useState<PickerVoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The agent's saved voice, and the one chosen in this session (not yet saved).
  const [savedId, setSavedId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PickerVoice | null>(null);
  const [saving, setSaving] = useState(false);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [previewFailedId, setPreviewFailedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Debounce typing into the query the server sees.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ agentId, page: String(page), limit: String(LIMIT) });
      if (query) params.set('q', query);
      const res = await authFetch(`${wsBase()}/voices/picker?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Could not load voices (${res.status})`);
      const pageData = data as PickerPage;
      setVoices(pageData.voices ?? []);
      setTotal(pageData.total ?? 0);
      setSavedId(pageData.selectedId ?? null);
    } catch (e) {
      setVoices([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Could not load voices');
    } finally {
      setLoading(false);
    }
  }, [agentId, page, query]);

  useEffect(() => { void load(); }, [load]);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setPlayingId(null);
  }, []);

  // Never leave a preview playing after the picker closes.
  useEffect(() => stopPreview, [stopPreview]);

  const togglePreview = async (voice: PickerVoice) => {
    if (playingId === voice.id) { stopPreview(); return; }
    stopPreview();
    setPreviewFailedId(null);
    setLoadingPreviewId(voice.id);
    try {
      // An <audio> element cannot send the Authorization header, so fetch the
      // preview as a blob and play it from an object URL.
      const res = await authFetch(`${wsBase()}/voices/${voice.id}/preview?text=${encodeURIComponent(PREVIEW_TEXT)}`);
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const objectUrl = URL.createObjectURL(await res.blob());
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = stopPreview;
      audio.onerror = () => { stopPreview(); setPreviewFailedId(voice.id); };
      setPlayingId(voice.id);
      await audio.play();
    } catch {
      stopPreview();
      setPreviewFailedId(voice.id);
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`${wsBase()}/agents/${agentId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: chosen.id }),
      });
      const body = await res.json().catch(() => ({}));
      // fetch only rejects on a network error; a server-side failure must not
      // look like a saved voice.
      if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Could not save the voice');
      const { label, voiceName } = body as { label?: string; voiceName?: string };
      stopPreview();
      onSaved({ id: chosen.id, name: voiceName || chosen.name, label: label ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the voice');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const activeId = chosen?.id ?? savedId;
  const canSave = Boolean(chosen && chosen.id !== savedId) && !saving;

  return (
    <>
      <style>{`
        @keyframes voice-spin { to { transform: rotate(360deg); } }
        .vp-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 9000; padding: 16px;
        }
        .vp-modal {
          background: var(--s1); border: 1px solid var(--line); border-radius: 16px;
          width: min(760px, 100%); max-height: 88vh; display: flex; flex-direction: column;
          overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.6);
        }
        .vp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 24px 0; }
        .vp-title { font-size: 17px; font-weight: 700; color: var(--tx); margin: 0; }
        .vp-sub { font-size: 12px; color: var(--tx-3); margin: 4px 0 0; }
        .vp-close {
          background: none; border: none; color: var(--tx-3); cursor: pointer; font-size: 22px;
          line-height: 1; padding: 4px 8px; border-radius: 6px;
        }
        .vp-close:hover { color: var(--tx); background: var(--s2); }
        .vp-search-wrap { position: relative; margin: 16px 24px 0; }
        .vp-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; display: flex; }
        .vp-search {
          width: 100%; box-sizing: border-box; padding: 10px 12px 10px 38px; font-size: 13px;
          background: var(--bg-primary); border: 1px solid var(--line-2); border-radius: 8px; color: var(--tx); outline: none;
        }
        .vp-search:focus { border-color: var(--cyan-fg); }
        .vp-body { flex: 1; overflow-y: auto; padding: 16px 24px; }
        .vp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
        .vp-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 48px;
          background: var(--bg-primary); border: 1px solid var(--line-2); border-radius: 10px;
          cursor: pointer; text-align: left; color: var(--tx); font: inherit;
        }
        .vp-row:hover { border-color: var(--tx-3); }
        .vp-row.is-active { border-color: var(--cyan-fg); box-shadow: 0 0 0 1px var(--cyan-fg); }
        .vp-play {
          width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: var(--s2); border: 1px solid var(--line-2); color: var(--tx); cursor: pointer;
        }
        .vp-play:hover { border-color: var(--cyan-fg); color: var(--cyan-fg); }
        .vp-play.is-playing { border-color: var(--cyan-fg); color: var(--cyan-fg); }
        .vp-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .vp-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vp-cat { font-size: 11.5px; color: var(--tx-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vp-check { color: var(--cyan-fg); display: flex; flex-shrink: 0; }
        .vp-note { font-size: 11px; color: var(--warn, #d6ac46); flex-shrink: 0; }
        .vp-empty { padding: 48px 12px; text-align: center; color: var(--tx-3); font-size: 13px; }
        .vp-error {
          margin: 12px 24px 0; padding: 10px 14px; border-radius: 8px; font-size: 12.5px;
          color: #f87171; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.28);
        }
        .vp-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          padding: 14px 24px; border-top: 1px solid var(--line);
        }
        .vp-pages { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tx-3); }
        .vp-btn {
          padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
          background: transparent; border: 1px solid var(--line-2); color: var(--tx-2);
        }
        .vp-btn:hover:not(:disabled) { color: var(--tx); border-color: var(--tx-3); }
        .vp-btn:disabled { opacity: 0.45; cursor: default; }
        .vp-btn-primary { background: var(--cyan); border-color: var(--cyan); color: #000; font-weight: 700; display: flex; align-items: center; gap: 6px; }
        .vp-btn-primary:hover:not(:disabled) { color: #000; border-color: var(--cyan); }
        @media (max-width: 520px) {
          .vp-head, .vp-body, .vp-foot { padding-left: 16px; padding-right: 16px; }
          .vp-search-wrap, .vp-error { margin-left: 16px; margin-right: 16px; }
          .vp-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="vp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="vp-modal" role="dialog" aria-modal="true" aria-labelledby="vp-title">
          <div className="vp-head">
            <div>
              <h2 id="vp-title" className="vp-title">Choose a voice</h2>
              <p className="vp-sub">Press play to hear a voice. Only voices that speak your agent&apos;s language are listed.</p>
            </div>
            <button type="button" className="vp-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="vp-search-wrap">
            <span className="vp-search-icon"><SearchIcon /></span>
            <input
              className="vp-search"
              type="search"
              placeholder="Search voices by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search voices by name"
            />
          </div>

          {error && <div className="vp-error" role="alert">{error}</div>}

          <div className="vp-body">
            {loading ? (
              <div className="vp-empty"><SpinnerIcon /> Loading voices…</div>
            ) : voices.length === 0 ? (
              <div className="vp-empty">{query ? `No voices match "${query}".` : 'No voices are available right now.'}</div>
            ) : (
              <div className="vp-grid">
                {voices.map((v) => {
                  const active = v.id === activeId;
                  const playing = playingId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`vp-row${active ? ' is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      onClick={() => setChosen(v)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(v); } }}
                    >
                      <button
                        type="button"
                        className={`vp-play${playing ? ' is-playing' : ''}`}
                        onClick={(e) => { e.stopPropagation(); void togglePreview(v); }}
                        aria-label={playing ? `Stop ${v.name}` : `Play ${v.name}`}
                      >
                        {loadingPreviewId === v.id ? <SpinnerIcon /> : playing ? <StopIcon /> : <PlayIcon />}
                      </button>
                      <span className="vp-text">
                        <span className="vp-name" title={v.name}>{v.name}</span>
                        {v.category && <span className="vp-cat" title={v.category}>{v.category}</span>}
                      </span>
                      {previewFailedId === v.id && <span className="vp-note">Can&apos;t play</span>}
                      {active && <span className="vp-check"><CheckIcon /></span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="vp-foot">
            <div className="vp-pages">
              <button type="button" className="vp-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" className="vp-btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="vp-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="vp-btn vp-btn-primary" disabled={!canSave} onClick={() => void save()}>
                {saving && <SpinnerIcon />} Use this voice
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
