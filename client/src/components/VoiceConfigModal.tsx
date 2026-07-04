// client/src/components/VoiceConfigModal.tsx
/**
 * Voice Configuration Modal
 * – Loads voices from the backend API (GET /api/voices)
 * – Provider tabs: Google, ElevenLabs (driven by real API data)
 * – Search by name
 * – Filter by gender and language
 * – Voice cards with Play/Preview button (real audio from backend)
 * – Select + Save persists to agent via PUT /api/agents/:agentId/voice
 * – Pagination (20 per page)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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

interface ProviderStatus {
  google: boolean;
  elevenlabs: boolean;
  details: {
    google: { healthy: boolean; latencyMs?: number; error?: string };
    elevenlabs: { healthy: boolean; latencyMs?: number; error?: string };
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
const LIMIT = 20;
const PROVIDERS = ['All', 'Google', 'ElevenLabs', 'Sarvam', 'Cartesia'];
const GENDER_OPTIONS = ['All', 'MALE', 'FEMALE', 'NEUTRAL'];
const DEFAULT_PREVIEW_TEXT = 'Hello, thank you for calling. How can I assist you today?';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') ?? '';
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
    'Chirp HD': '#a78bfa',
    'Chirp': '#818cf8',
    'Neural2': '#38bdf8',
    'WaveNet': '#34d399',
    'Studio': '#fb923c',
    'News': '#f472b6',
    'Standard': '#94a3b8',
    'premade': '#60a5fa',
    'cloned': '#f59e0b',
    'generated': '#4ade80',
  };
  return map[category ?? ''] ?? '#94a3b8';
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
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
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
    fetch(`${API_BASE}/voice/providers/status`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setProviderStatus)
      .catch(() => null);
  }, []);

  // ── Load languages for filter dropdown ─────────────────────────────
  useEffect(() => {
    // pull unique languages from the current page results
    const unique = Array.from(new Set(voices.map(v => v.language).filter(Boolean) as string[])).sort();
    setLanguages(unique);
  }, [voices]);

  // ── Fetch voices ───────────────────────────────────────────────────
  const fetchVoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (activeProvider !== 'All') params.set('provider', activeProvider);
      if (genderFilter !== 'All') params.set('gender', genderFilter.toLowerCase());
      if (languageFilter !== 'All') params.set('language', languageFilter);

      const data: PaginatedVoices = await fetch(`${API_BASE}/voices?${params}`, {
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
      const url = `${API_BASE}/voices/${voice.id}/preview?text=${encodeURIComponent(DEFAULT_PREVIEW_TEXT)}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
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
      await fetch(`${API_BASE}/agents/${agentId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ voiceId: selectedVoice.id }),
      });
      setSaveSuccess(selectedVoice.id);
      setTimeout(() => setSaveSuccess(null), 2000);
      onSaved(selectedVoice);
    } catch {
      alert('Failed to save voice. Please try again.');
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
          background: #111;
          border: 1px solid #222;
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
        .voice-modal-title { font-size: 17px; font-weight: 700; color: #fff; margin: 0; }
        .voice-modal-close {
          background: none; border: none; color: #666; cursor: pointer;
          font-size: 22px; line-height: 1; padding: 4px;
          border-radius: 6px; transition: color 0.15s, background 0.15s;
        }
        .voice-modal-close:hover { color: #fff; background: #222; }
        .voice-modal-controls { padding: 20px 28px 0; flex-shrink: 0; }
        .provider-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
        .provider-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 13px; font-weight: 500;
          transition: all 0.15s;
        }
        .provider-tab-active { background: #00bcd4; color: #000; }
        .provider-tab-inactive { background: #1a1a1a; color: #aaa; border: 1px solid #2a2a2a; }
        .provider-tab-inactive:hover { background: #222; color: #fff; }
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
          background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
          color: #fff; font-size: 13px; outline: none; box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .voice-search::placeholder { color: #555; }
        .voice-search:focus { border-color: #00bcd4; }
        .voice-filter-select {
          padding: 9px 12px; background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 8px; color: #aaa; font-size: 12px; cursor: pointer;
          outline: none; transition: border-color 0.15s;
        }
        .voice-filter-select:focus { border-color: #00bcd4; color: #fff; }
        .voice-filter-select option { background: #1a1a1a; }
        .voice-modal-body {
          flex: 1; overflow-y: auto; padding: 20px 28px;
          scrollbar-width: thin; scrollbar-color: #2a2a2a #0f0f0f;
        }
        .voice-modal-body::-webkit-scrollbar { width: 6px; }
        .voice-modal-body::-webkit-scrollbar-track { background: #0f0f0f; }
        .voice-modal-body::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
        .voice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .voice-card {
          background: #161616; border: 1px solid #232323; border-radius: 12px;
          padding: 16px; cursor: pointer; transition: all 0.15s; position: relative;
        }
        .voice-card:hover { border-color: #333; background: #1a1a1a; }
        .voice-card-selected { border-color: #00bcd4 !important; background: #0d2226 !important; box-shadow: 0 0 0 1px #00bcd4; }
        .voice-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
        .voice-card-name { font-size: 13px; font-weight: 600; color: #f0f0f0; line-height: 1.3; word-break: break-all; }
        .voice-card-provider { font-size: 11px; color: #666; margin-top: 2px; }
        .voice-card-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .voice-tag {
          font-size: 10px; padding: 2px 8px; border-radius: 4px;
          font-weight: 500; color: #000; display: inline-block;
        }
        .voice-tag-gender { background: #334155; color: #94a3b8; }
        .voice-card-actions { display: flex; gap: 8px; align-items: center; }
        .voice-btn-preview {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 6px; border: 1px solid #2a2a2a;
          background: #1a1a1a; color: #aaa; font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .voice-btn-preview:hover { border-color: #444; color: #fff; }
        .voice-btn-preview-active { border-color: #ef4444 !important; color: #ef4444 !important; }
        .voice-btn-select {
          flex: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid #2a2a2a;
          background: transparent; color: #aaa; font-size: 11px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
        }
        .voice-btn-select-active { border-color: #00bcd4 !important; color: #00bcd4 !important; background: rgba(0,188,212,0.08) !important; }
        .voice-btn-select:hover { border-color: #444; color: #fff; }
        .voice-modal-footer {
          flex-shrink: 0;
          padding: 16px 28px;
          border-top: 1px solid #1a1a1a;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .voice-pagination { display: flex; align-items: center; gap: 8px; }
        .voice-page-btn {
          padding: 6px 12px; background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 6px; color: #aaa; font-size: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .voice-page-btn:hover:not(:disabled) { background: #222; color: #fff; }
        .voice-page-btn:disabled { opacity: 0.4; cursor: default; }
        .voice-page-info { font-size: 12px; color: #555; white-space: nowrap; }
        .voice-footer-right { display: flex; gap: 10px; align-items: center; }
        .voice-btn-cancel {
          padding: 9px 20px; background: transparent; border: 1px solid #2a2a2a;
          border-radius: 8px; color: #aaa; font-size: 13px; cursor: pointer;
          transition: all 0.15s;
        }
        .voice-btn-cancel:hover { border-color: #444; color: #fff; }
        .voice-btn-save {
          padding: 9px 24px; background: #00bcd4; border: none; border-radius: 8px;
          color: #000; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .voice-btn-save:hover:not(:disabled) { background: #00d4f0; }
        .voice-btn-save:disabled { opacity: 0.5; cursor: default; }
        .voice-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 60px 20px; color: #555; text-align: center; gap: 12px;
        }
        .voice-empty-icon { font-size: 40px; }
        .voice-empty-title { font-size: 14px; font-weight: 600; color: #666; }
        .voice-empty-desc { font-size: 12px; line-height: 1.6; max-width: 380px; }
        .voice-loading-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .voice-skeleton {
          background: #161616; border: 1px solid #1e1e1e; border-radius: 12px;
          padding: 16px; height: 120px;
          background: linear-gradient(90deg, #161616 25%, #1e1e1e 50%, #161616 75%);
          background-size: 200% 100%;
          animation: voice-shimmer 1.4s infinite;
        }
        @keyframes voice-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .voice-selected-info {
          font-size: 12px; color: #666;
          display: flex; align-items: center; gap: 6px;
        }
        .voice-selected-name { color: #00bcd4; font-weight: 600; }
        .voice-error {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 18px; background: #1a0e0e; border: 1px solid #3a1a1a;
          border-radius: 10px; color: #f87171; font-size: 13px; margin-bottom: 16px;
        }
      `}</style>

      <div className="voice-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="voice-modal" role="dialog" aria-modal="true" aria-label="Voice Configuration">

          {/* Header */}
          <div className="voice-modal-header">
            <div>
              <h2 className="voice-modal-title">🎙 Voice Configuration</h2>
              <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
                {total > 0 ? `${total} voices available` : 'Select a voice for your agent'}
              </p>
            </div>
            <button className="voice-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Controls */}
          <div className="voice-modal-controls">
            {/* Provider Tabs */}
            <div className="provider-tabs">
              {PROVIDERS.map(p => {
                const isActive = activeProvider === p;
                const healthy = p === 'Google' ? providerStatus?.google
                  : p === 'ElevenLabs' ? providerStatus?.elevenlabs
                  : p === 'Sarvam' ? providerStatus?.sarvam
                  : null;
                return (
                  <button
                    key={p}
                    className={`provider-tab ${isActive ? 'provider-tab-active' : 'provider-tab-inactive'}`}
                    onClick={() => setActiveProvider(p)}
                  >
                    {healthy !== null && (
                      <span
                        className="provider-status-dot"
                        style={{ background: healthy ? '#22c55e' : '#ef4444' }}
                        title={healthy ? 'Provider connected' : 'Provider not connected'}
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
            </div>
          </div>

          {/* Body */}
          <div className="voice-modal-body">
            {error && (
              <div className="voice-error">
                ⚠ {error}
                {isDbEmpty && (
                  <span style={{ marginLeft: '8px' }}>
                    — Sync voices first via <code style={{ background: '#2a0e0e', padding: '2px 6px', borderRadius: '4px' }}>POST /api/voices/sync</code>
                  </span>
                )}
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
                    ? 'Configure your Google TTS and ElevenLabs API keys, then call POST /api/voices/sync to populate the voice library.'
                    : 'Try adjusting your search term or filters to find more voices.'}
                </div>
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
                          <div style={{ color: '#00bcd4', flexShrink: 0, marginTop: '2px' }}>
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
                          <span className="voice-tag" style={{ background: '#1e1a2e', color: '#818cf8', border: '1px solid #3730a3' }}>
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
                  <span style={{ color: '#444' }}>({selectedVoice.provider})</span>
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
