// client/src/components/VoiceConfigModal.tsx
/**
 * Voice Configuration Modal
 * – Loads voices from the backend API (GET /api/voices)
 * – Provider tabs: Google, ElevenLabs, Sarvam, Cartesia, FishAudio (driven by real API data)
 * – Search by name
 * – Filter by gender and language
 * – Voice cards with Play/Preview button (real audio from backend)
 * – Select + Save persists to agent via PUT /api/agents/:agentId/voice
 * – Pagination (20 per page)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

import { getAuth } from '@/lib/authStorage';
import { fetchModelCatalog, type ModelCatalog } from '@/lib/modelCatalog';
// ─── Types ────────────────────────────────────────────────────────────────────

interface Voice {
  id: string;
  provider: string;
  providerVoiceId: string;
  name: string;
  language: string | null;
  accent: string | null;
  gender: string | null;
  category: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ProviderHealth { healthy: boolean; latencyMs?: number; error?: string }
interface ProviderStatus {
  google: boolean;
  elevenlabs: boolean;
  sarvam?: boolean;
  cartesia?: boolean;
  fishaudio?: boolean;
  details: {
    google: ProviderHealth;
    elevenlabs: ProviderHealth;
    sarvam?: ProviderHealth;
    cartesia?: ProviderHealth;
    fishaudio?: ProviderHealth;
  };
}

interface PaginatedVoices {
  total: number;
  page: number;
  limit: number;
  voices: Voice[];
}

interface VoiceConfigModalProps {
  agentId: string;
  currentVoiceId?: string | null;
  onClose: () => void;
  onSaved: (voice: Voice) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1';
// All voice/agent endpoints are workspace-scoped and authenticated.
const wsBase = () => `${API_BASE}/workspaces/${getAuth().workspaceId}`;
const LIMIT = 20;
// NB: each label is sent verbatim as the ?provider= filter and must equal the
// backend VoiceProvider.name exactly — that match is case-sensitive. Which of
// these are actually offered comes from Super Admin → Models at runtime; this
// list only fixes the tab ORDER.
const PROVIDER_ORDER = ['Google', 'ElevenLabs', 'Sarvam', 'Cartesia', 'FishAudio'];
const GENDER_OPTIONS = ['All', 'MALE', 'FEMALE', 'NEUTRAL'];
const DEFAULT_PREVIEW_TEXT = 'Hello, thank you for calling. How can I assist you today?';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const { token } = getAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function genderIcon(gender: string | null) {
  if (!gender) return '◌';
  if (gender === 'MALE') return '♂';
  if (gender === 'FEMALE') return '♀';
  return '⚥';
}

function categoryColor(category: string | null): string {
  const map: Record<string, string> = {
    'Chirp HD': 'var(--violet)',
    'Chirp': 'var(--violet)',
    'Neural2': '#38bdf8',
    'WaveNet': '#34d399',
    'Studio': '#fb923c',
    'News': '#f472b6',
    'Standard': 'var(--tx-2)',
    'premade': 'var(--cyan-fg)',
    'cloned': 'var(--warn)',
    'generated': '#4ade80',
  };
  return map[category ?? ''] ?? 'var(--tx-2)';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ animation: 'voice-spin 0.8s linear infinite' }}>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
    <path d="M12 2 a10 10 0 0 1 10 10" />
  </svg>
);

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx-3)" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VoiceConfigModal({
  agentId,
  currentVoiceId: _currentVoiceId,
  onClose,
  onSaved,
}: VoiceConfigModalProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [activeProvider, setActiveProvider] = useState('All');
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('All');
  const [languageFilter, setLanguageFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);

  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ── Load provider status ───────────────────────────────────────────
  useEffect(() => {
    fetch(`${wsBase()}/voices/providers/status`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setProviderStatus)
      .catch(() => null);
  }, []);

  // ── Which voice providers this platform offers ─────────────────────
  // Super Admin can switch a provider off; its tab then disappears and the
  // backend stops returning its voices, so the list and the tabs agree.
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => { fetchModelCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);

  const enabledProviders = catalog
    ? PROVIDER_ORDER.filter(p => catalog.tts.some(m => m.value.toLowerCase() === p.toLowerCase()))
    : PROVIDER_ORDER;
  const providerTabs = ['All', ...enabledProviders];

  // If the tab that was open belongs to a provider that has since been switched
  // off, fall back to All rather than leaving a filter no tab can clear.
  useEffect(() => {
    if (activeProvider !== 'All' && !providerTabs.includes(activeProvider)) setActiveProvider('All');
    // Keyed on the joined list, not the array: it is rebuilt every render.
  }, [activeProvider, providerTabs.join(',')]);

  // ── Load languages for filter dropdown ─────────────────────────────
  useEffect(() => {
    // pull unique languages from the current page results
    const unique = Array.from(new Set(voices.map(v => v.language).filter(Boolean) as string[])).sort();
    setLanguages(unique);
  }, [voices]);

  // ── Fetch voices ───────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${wsBase()}/voices/sync`, { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`);
      await fetchVoices();
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice sync failed — check provider API keys in backend/.env');
    } finally {
      setSyncing(false);
    }
  };

  const fetchVoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (activeProvider !== 'All') params.set('provider', activeProvider);
      if (genderFilter !== 'All') params.set('gender', genderFilter.toLowerCase());
      if (languageFilter !== 'All') params.set('language', languageFilter);

      const data: PaginatedVoices = await fetch(`${wsBase()}/voices?${params}`, {
        headers: authHeaders(),
      }).then(r => r.json());

      // Client-side search filter only
      let filtered = data.voices ?? [];
      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(v =>
          v.name?.toLowerCase().includes(q) ||
          v.language?.toLowerCase().includes(q) ||
          v.accent?.toLowerCase().includes(q) ||
          v.category?.toLowerCase().includes(q)
        );
      }

      setVoices(filtered);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError('Failed to load voices. Check API connection.');
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, [page, activeProvider, search, genderFilter, languageFilter]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(fetchVoices, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [fetchVoices]);

  // Reset page on filter changes
  useEffect(() => { setPage(1); }, [activeProvider, search, genderFilter, languageFilter]);

  // ── Audio preview ──────────────────────────────────────────────────
  const handlePreview = async (voice: Voice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingId(voice.id);
    try {
      // Audio elements can't send Authorization headers, so fetch the preview
      // as a blob with proper auth and play it from an object URL.
      const url = `${wsBase()}/voices/${voice.id}/preview?text=${encodeURIComponent(DEFAULT_PREVIEW_TEXT)}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(objectUrl); };
      audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(objectUrl); };
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  };

  // ── Save voice ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedVoice) return;
    setSavingId(selectedVoice.id);
    try {
      const res = await fetch(`${wsBase()}/agents/${agentId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ voiceId: selectedVoice.id }),
      });
      // fetch only rejects on a network error, so an unchecked call reported
      // success for every server-side failure — the tick appeared and the voice
      // was never saved.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save voice');
      }
      setSaveSuccess(selectedVoice.id);
      setTimeout(() => setSaveSuccess(null), 2000);
      onSaved(selectedVoice);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save voice. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // ── Render ─────────────────────────────────────────────────────────
  const noVoices = !loading && voices.length === 0;
  const isDbEmpty = total === 0 && !loading && !error && activeProvider === 'All' && !search;

  return (
    <>
      <style>{`
        @keyframes voice-spin { to { transform: rotate(360deg); } }
        @keyframes voice-fadein { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .voice-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 9000;
          animation: voice-fadein 0.2s ease;
        }
        .voice-modal {
          background: var(--s1);
          border: 1px solid var(--s2);
          border-radius: 16px;
          width: min(960px, 94vw);
          max-height: 88vh;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.7);
          animation: voice-fadein 0.25s ease;
        }
        .voice-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 28px 0;
          flex-shrink: 0;
        }
        .voice-modal-title { font-size: 17px; font-weight: 700; color: var(--tx); margin: 0; }
        .voice-modal-close {
          background: none; border: none; color: var(--tx-3); cursor: pointer;
          font-size: 22px; line-height: 1; padding: 4px;
          border-radius: 6px; transition: color 0.15s, background 0.15s;
        }
        .voice-modal-close:hover { color: var(--tx); background: var(--s2); }
        .voice-modal-controls { padding: 20px 28px 0; flex-shrink: 0; }
        .provider-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
        .provider-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 13px; font-weight: 500;
          transition: all 0.15s;
        }
        .provider-tab-active { background: var(--cyan-fg); color: #000; }
        .provider-tab-inactive { background: var(--s1); color: var(--tx-2); border: 1px solid var(--s3); }
        .provider-tab-inactive:hover { background: var(--s2); color: var(--tx); }
        .provider-status-dot {
          width: 7px; height: 7px; border-radius: 50%;
          display: inline-block; flex-shrink: 0;
        }
        .voice-filters { display: flex; gap: 10px; align-items: center; }
        .voice-search-wrap {
          position: relative; flex: 1; min-width: 0;
        }
        .voice-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .voice-search {
          width: 100%; padding: 9px 12px 9px 38px;
          background: var(--s1); border: 1px solid var(--s3); border-radius: 8px;
          color: var(--tx); font-size: 13px; outline: none; box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .voice-search::placeholder { color: var(--tx-3); }
        .voice-search:focus { border-color: var(--cyan-fg); }
        .voice-filter-select {
          padding: 9px 12px; background: var(--s1); border: 1px solid var(--s3);
          border-radius: 8px; color: var(--tx-2); font-size: 12px; cursor: pointer;
          outline: none; transition: border-color 0.15s;
        }
        .voice-filter-select:focus { border-color: var(--cyan-fg); color: var(--tx); }
        .voice-filter-select option { background: var(--s1); }
        .voice-modal-body {
          flex: 1; overflow-y: auto; padding: 20px 28px;
          scrollbar-width: thin; scrollbar-color: var(--s3) var(--bg);
        }
        .voice-modal-body::-webkit-scrollbar { width: 6px; }
        .voice-modal-body::-webkit-scrollbar-track { background: var(--bg); }
        .voice-modal-body::-webkit-scrollbar-thumb { background: var(--s3); border-radius: 3px; }
        .voice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .voice-card {
          background: var(--s1); border: 1px solid var(--line-2); border-radius: 12px;
          padding: 16px; cursor: pointer; transition: all 0.15s; position: relative;
        }
        .voice-card:hover { border-color: var(--line-2); background: var(--s1); }
        .voice-card-selected { border-color: var(--cyan-fg) !important; background: #0d2226 !important; box-shadow: 0 0 0 1px var(--cyan-fg); }
        .voice-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
        .voice-card-name { font-size: 13px; font-weight: 600; color: #f0f0f0; line-height: 1.3; word-break: break-all; }
        .voice-card-provider { font-size: 11px; color: var(--tx-3); margin-top: 2px; }
        .voice-card-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .voice-tag {
          font-size: 10px; padding: 2px 8px; border-radius: 4px;
          font-weight: 500; color: #000; display: inline-block;
        }
        .voice-tag-gender { background: #334155; color: #94a3b8; }
        .voice-card-actions { display: flex; gap: 8px; align-items: center; }
        .voice-btn-preview {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 6px; border: 1px solid var(--s3);
          background: var(--s1); color: var(--tx-2); font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .voice-btn-preview:hover { border-color: var(--line-2); color: var(--tx); }
        .voice-btn-preview-active { border-color: #ef4444 !important; color: #ef4444 !important; }
        .voice-btn-select {
          flex: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--s3);
          background: transparent; color: var(--tx-2); font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
        }
        .voice-btn-select-active { border-color: var(--cyan-fg) !important; color: var(--cyan-fg) !important; background: rgba(0,188,212,0.08) !important; }
        .voice-btn-select:hover { border-color: var(--line-2); color: var(--tx); }
        .voice-modal-footer {
          flex-shrink: 0;
          padding: 16px 28px;
          border-top: 1px solid var(--s1);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .voice-pagination { display: flex; align-items: center; gap: 8px; }
        .voice-page-btn {
          padding: 6px 12px; background: var(--s1); border: 1px solid var(--s3);
          border-radius: 6px; color: var(--tx-2); font-size: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .voice-page-btn:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
        .voice-page-btn:disabled { opacity: 0.4; cursor: default; }
        .voice-page-info { font-size: 12px; color: var(--tx-3); white-space: nowrap; }
        .voice-footer-right { display: flex; gap: 10px; align-items: center; }
        .voice-btn-cancel {
          padding: 9px 20px; background: transparent; border: 1px solid var(--s3);
          border-radius: 8px; color: var(--tx-2); font-size: 13px; cursor: pointer;
          transition: all 0.15s;
        }
        .voice-btn-cancel:hover { border-color: var(--line-2); color: var(--tx); }
        .voice-btn-save {
          padding: 9px 24px; background: var(--cyan-fg); border: none; border-radius: 8px;
          color: #000; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .voice-btn-save:hover:not(:disabled) { background: #00d4f0; }
        .voice-btn-save:disabled { opacity: 0.5; cursor: default; }
        .voice-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 60px 20px; color: var(--tx-3); text-align: center; gap: 12px;
        }
        .voice-empty-icon { font-size: 40px; }
        .voice-empty-title { font-size: 14px; font-weight: 600; color: var(--tx-3); }
        .voice-empty-desc { font-size: 12px; line-height: 1.6; max-width: 380px; }
        .voice-loading-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .voice-skeleton {
          background: var(--s1); border: 1px solid #1e1e1e; border-radius: 12px;
          padding: 16px; height: 120px;
          background: linear-gradient(90deg, var(--s1) 25%, #1e1e1e 50%, var(--s1) 75%);
          background-size: 200% 100%;
          animation: voice-shimmer 1.4s infinite;
        }
        @keyframes voice-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .voice-selected-info {
          font-size: 12px; color: var(--tx-3);
          display: flex; align-items: center; gap: 6px;
        }
        .voice-selected-name { color: var(--cyan-fg); font-weight: 600; }
        .voice-error {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 18px; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.28);
          border-radius: 10px; color: #f87171; font-size: 13px; margin-bottom: 16px;
        }
      `}</style>

      <div className="voice-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="voice-modal" role="dialog" aria-modal="true" aria-label="Voice Configuration">

          {/* Header */}
          <div className="voice-modal-header">
            <div>
              <h2 className="voice-modal-title">🎙 Voice Configuration</h2>
              <p style={{ fontSize: '12px', color: 'var(--tx-3)', margin: '4px 0 0' }}>
                {total > 0 ? `${total} voices available` : 'Select a voice for your agent'}
              </p>
            </div>
            <button className="voice-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Controls */}
          <div className="voice-modal-controls">
            {/* Provider Tabs */}
            <div className="provider-tabs">
              {providerTabs.map(p => {
                const isActive = activeProvider === p;
                // Until the status request resolves, providerStatus is null —
                // show a neutral "checking" dot rather than a misleading red
                // "not connected" one that flickers on every page refresh.
                const loaded = providerStatus !== null;
                const healthy = !loaded ? undefined
                  : p === 'Google' ? providerStatus!.google
                  : p === 'ElevenLabs' ? providerStatus!.elevenlabs
                  : p === 'Sarvam' ? providerStatus!.sarvam
                  : p === 'Cartesia' ? providerStatus!.cartesia
                  : p === 'FishAudio' ? providerStatus!.fishaudio
                  : undefined; // 'All' has no provider dot
                const showDot = p !== 'All';
                const dotColor = !loaded ? '#9ca3af' : healthy ? '#22c55e' : 'var(--err)';
                const dotTitle = !loaded ? 'Checking provider…' : healthy ? 'Provider connected' : 'Provider not connected';
                return (
                  <button
                    key={p}
                    className={`provider-tab ${isActive ? 'provider-tab-active' : 'provider-tab-inactive'}`}
                    onClick={() => setActiveProvider(p)}
                  >
                    {showDot && (
                      <span
                        className="provider-status-dot"
                        style={{ background: dotColor }}
                        title={dotTitle}
                      />
                    )}
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <div className="voice-filters">
              <div className="voice-search-wrap">
                <div className="voice-search-icon"><SearchIcon /></div>
                <input
                  className="voice-search"
                  type="text"
                  placeholder="Search voices by name, language, accent…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  id="voice-search-input"
                />
              </div>
              <select
                className="voice-filter-select"
                value={genderFilter}
                onChange={e => setGenderFilter(e.target.value)}
                id="voice-gender-filter"
              >
                {GENDER_OPTIONS.map(g => (
                  <option key={g} value={g}>{g === 'All' ? 'All Genders' : capitalize(g)}</option>
                ))}
              </select>
              <select
                className="voice-filter-select"
                value={languageFilter}
                onChange={e => setLanguageFilter(e.target.value)}
                id="voice-language-filter"
                style={{ maxWidth: '140px' }}
              >
                <option value="All">All Languages</option>
                {languages.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {/* Always available — voices added to a provider's library after the
                  last sync (e.g. ElevenLabs Voice Library additions) only appear
                  once re-synced, and that isn't only an empty-library situation. */}
              <button
                className="voice-filter-select"
                style={{ cursor: syncing ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                disabled={syncing}
                onClick={handleSyncNow}
                title="Re-pull voices from the providers configured in backend/.env"
              >
                {syncing ? 'Syncing…' : '⟳ Sync'}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="voice-modal-body">
            {error && (
              <div className="voice-error">
                ⚠ {error}
                {isDbEmpty && <span style={{ marginLeft: '8px' }}>— use the “Sync voices now” button below.</span>}
              </div>
            )}

            {loading ? (
              <div className="voice-loading-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="voice-skeleton" />
                ))}
              </div>
            ) : noVoices ? (
              <div className="voice-empty">
                <div className="voice-empty-icon">🎤</div>
                <div className="voice-empty-title">
                  {isDbEmpty ? 'No voices synced yet' : 'No voices match your filters'}
                </div>
                <div className="voice-empty-desc">
                  {isDbEmpty
                    ? 'Your voice library is empty. Click "Sync voices now" to pull voices from the providers configured in backend/.env (Sarvam, ElevenLabs, Google TTS, Cartesia, Fish Audio).'
                    : 'Try adjusting your search term or filters to find more voices.'}
                </div>
                {isDbEmpty && (
                  <button
                    className="voice-btn-save"
                    style={{ marginTop: '8px' }}
                    disabled={syncing}
                    onClick={handleSyncNow}
                  >
                    {syncing ? 'Syncing…' : '⟳ Sync voices now'}
                  </button>
                )}
                {!isDbEmpty && (
                  <button
                    className="voice-btn-cancel"
                    style={{ marginTop: '8px' }}
                    onClick={() => { setSearch(''); setGenderFilter('All'); setLanguageFilter('All'); }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="voice-grid">
                {voices.map(v => {
                  const isSelected = selectedVoice?.id === v.id;
                  const isPlaying = playingId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`voice-card ${isSelected ? 'voice-card-selected' : ''}`}
                      onClick={() => setSelectedVoice(isSelected ? null : v)}
                      id={`voice-card-${v.id}`}
                    >
                      <div className="voice-card-header">
                        <div>
                          <div className="voice-card-name">{v.name}</div>
                          <div className="voice-card-provider">{v.provider}</div>
                        </div>
                        {isSelected && (
                          <div style={{ color: 'var(--cyan-fg)', flexShrink: 0, marginTop: '2px' }}>
                            <CheckIcon />
                          </div>
                        )}
                      </div>

                      <div className="voice-card-tags">
                        {v.category && (
                          <span className="voice-tag" style={{ background: categoryColor(v.category) + '22', color: categoryColor(v.category), border: `1px solid ${categoryColor(v.category)}44` }}>
                            {v.category}
                          </span>
                        )}
                        {v.gender && (
                          <span className="voice-tag voice-tag-gender">
                            {genderIcon(v.gender)} {capitalize(v.gender)}
                          </span>
                        )}
                        {v.language && (
                          <span className="voice-tag" style={{ background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}>
                            {v.language}
                          </span>
                        )}
                        {v.accent && v.accent !== v.language && (
                          <span className="voice-tag" style={{ background: '#1e1a2e', color: 'var(--violet)', border: '1px solid #3730a3' }}>
                            {v.accent}
                          </span>
                        )}
                      </div>

                      <div className="voice-card-actions">
                        <button
                          className={`voice-btn-preview ${isPlaying ? 'voice-btn-preview-active' : ''}`}
                          onClick={e => handlePreview(v, e)}
                          title={isPlaying ? 'Stop preview' : 'Play preview'}
                          id={`voice-preview-${v.id}`}
                        >
                          {isPlaying ? <StopIcon /> : <PlayIcon />}
                          {isPlaying ? 'Stop' : 'Preview'}
                        </button>
                        <button
                          className={`voice-btn-select ${isSelected ? 'voice-btn-select-active' : ''}`}
                          onClick={e => { e.stopPropagation(); setSelectedVoice(isSelected ? null : v); }}
                        >
                          {isSelected ? '✓ Selected' : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="voice-modal-footer">
            {/* Pagination */}
            <div className="voice-pagination">
              <button
                className="voice-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                id="voice-prev-page"
              >← Prev</button>
              <span className="voice-page-info">Page {page} / {totalPages}</span>
              <button
                className="voice-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                id="voice-next-page"
              >Next →</button>
            </div>

            {/* Right: selection info + actions */}
            <div className="voice-footer-right">
              {selectedVoice && (
                <div className="voice-selected-info">
                  Selected: <span className="voice-selected-name">{selectedVoice.name}</span>
                  <span style={{ color: 'var(--line-2)' }}>({selectedVoice.provider})</span>
                </div>
              )}
              <button className="voice-btn-cancel" onClick={onClose} id="voice-cancel-btn">
                Cancel
              </button>
              <button
                className="voice-btn-save"
                disabled={!selectedVoice || !!savingId}
                onClick={handleSave}
                id="voice-save-btn"
              >
                {savingId ? <SpinnerIcon /> : saveSuccess ? <CheckIcon /> : null}
                {saveSuccess ? 'Saved!' : 'Save Voice'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
