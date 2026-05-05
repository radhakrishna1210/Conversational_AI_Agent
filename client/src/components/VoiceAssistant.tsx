import React, { useState, useEffect, useRef } from 'react';
import { ttsSocket } from '../services/ttsSocket';
import { audioPlayer } from '../services/audioPlayer';

interface Voice {
  name: string;
  gender: string;
  style: string;
  category?: string;
}

export default function VoiceAssistant() {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('auto');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'speaking' | 'error' | 'listening'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  // null = idle, string = that voice is loading or playing a preview
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [useTurbo, setUseTurbo] = useState(false); // Turbo mode for faster response

  // Ref to track recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);

  // Ref to track the current preview audio element
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 1. Fetch available voices with metadata
    fetch('http://localhost:8000/api/tts/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          // Set initial selection if not set
          if (!data.voices.find((v: Voice) => v.name === selectedVoice)) {
            setSelectedVoice(data.voices[0].name);
          }
        }
      })
      .catch(err => {
        console.error("Failed to fetch voices", err);
      });

    // 2. Connect to TTS WebSocket
    ttsSocket.connect(
      (chunk) => {
        // Transition from thinking to speaking on the very first chunk
        setStatus('speaking');
        audioPlayer.playChunk(chunk);
      },
      (err) => {
        setErrorMessage(err);
        setStatus('error');
      },
      () => {
        setStatus('idle');
        setIsConnected(false);
      }
    );

    // BARGE-IN MONITOR: Check for user voice activity while AI is speaking
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    vadIntervalRef.current = window.setInterval(() => {
      if (status === 'speaking' && analyserRef.current && isRecording) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

        // If user volume exceeds threshold, barge in!
        if (average > 40) { // Adjustable threshold
          console.log("[Barge-in] Voice activity detected. Stopping AI playback.");
          audioPlayer.stop();
          setStatus('idle');
        }
      }
    }, 100);

    // Monitor connection status
    const interval = setInterval(() => {
      setIsConnected(ttsSocket.isConnected());
    }, 1000);

    return () => {
      clearInterval(interval);
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      ttsSocket.disconnect();
      audioPlayer.stop();
    };
  }, []);

  const handleSpeak = () => {
    if (!text.trim()) return;
    // Atomically stop any in-flight stream, drop queued chunks, reset timing
    audioPlayer.cancelStream();
    setErrorMessage('');
    setStatus('thinking'); // Set to thinking immediately after sending
    ttsSocket.sendText(text, useTurbo ? 'turbo' : selectedVoice);
  };

  const handleStop = () => {
    audioPlayer.stop();
    setStatus('idle');
  };

  const handlePreview = async (voiceName: string) => {
    // Stop any currently playing or loading preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    // If clicking the same voice that's already playing, just stop it
    if (isPreviewing === voiceName || isPreviewLoading === voiceName) {
      setIsPreviewing(null);
      setIsPreviewLoading(null);
      return;
    }

    setIsPreviewLoading(voiceName);
    setIsPreviewing(null);

    let objectUrl: string | null = null;

    try {
      const response = await fetch('http://localhost:8000/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceName }),
      });

      if (!response.ok) throw new Error(`Preview failed: ${response.status}`);

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);

      // Separate HTMLAudioElement — completely isolated from the Web Audio
      // scheduler used for the main TTS stream; no cancelStream() needed.
      const audio = new Audio(objectUrl);
      previewAudioRef.current = audio;

      const cleanup = () => {
        setIsPreviewing(null);
        setIsPreviewLoading(null);
        previewAudioRef.current = null;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };

      audio.onended = cleanup;
      audio.onerror = () => {
        console.error('[Preview] Playback error for voice:', voiceName);
        cleanup();
      };

      setIsPreviewLoading(null);
      setIsPreviewing(voiceName);
      console.log(`[Preview] Playing preview for voice: ${voiceName}`);
      await audio.play();

    } catch (err) {
      console.error('[Preview] Error:', err);
      setIsPreviewing(null);
      setIsPreviewLoading(null);
      previewAudioRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  // ── Speech-to-Text (STT) Logic ───────────────────────────────────────────

  const startRecording = async () => {
    // BARGE-IN: If the AI is currently speaking, stop it immediately when user starts talking
    if (status === 'speaking' || status === 'thinking') {
      console.log("[Barge-in] User interrupted playback.");
      audioPlayer.stop();
      setStatus('idle');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup Analyser for Barge-in detection
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscribe(audioBlob);

        // Cleanup AudioContext and tracks
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      };

      recorder.start();
      setIsRecording(true);
      setStatus('listening');
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      setErrorMessage("Microphone access denied. Please check permissions.");
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('idle');
    }
  };

  const handleTranscribe = async (blob: Blob) => {
    setIsTranscribing(true);
    setStatus('thinking');

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');

    try {
      const response = await fetch('http://localhost:8000/api/stt/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Transcription failed');

      const data = await response.json();
      const transcribedText = data.text;

      if (transcribedText) {
        setText(transcribedText);
        // Automatically trigger TTS for the transcribed text
        // Use a small delay to ensure state has updated
        setTimeout(() => {
          handleSpeakWithText(transcribedText);
        }, 100);
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error("STT Error:", err);
      setErrorMessage("Speech recognition failed. Please try again.");
      setStatus('error');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Helper to trigger speak with specific text (bypassing state lag)
  const handleSpeakWithText = (speakText: string) => {
    if (!speakText.trim()) return;
    audioPlayer.cancelStream();
    setErrorMessage('');
    setStatus('thinking');
    ttsSocket.sendText(speakText, useTurbo ? 'turbo' : selectedVoice);
  };

  // Gender icon helpers
  const genderIcon = (gender: string) =>
    gender === 'male' ? '👤' : gender === 'female' ? '👥' : '🤖';

  const genderLabel = (gender: string) =>
    gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : 'AI';

  // Grouping: ordered sections
  const groups: { label: string; icon: string; voices: Voice[] }[] = [
    {
      label: 'Female',
      icon: '👥',
      voices: voices.filter(v => v.gender === 'female'),
    },
    {
      label: 'Male',
      icon: '👤',
      voices: voices.filter(v => v.gender === 'male'),
    },
    {
      label: 'Specialist',
      icon: '🤖',
      voices: voices.filter(v => v.gender !== 'male' && v.gender !== 'female'),
    },
  ].filter(g => g.voices.length > 0);

  const filteredVoices = voices.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (v.style && v.style.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedVoiceObj = voices.find(v => v.name === selectedVoice) ?? null;

  return (
    <div className="dashboard-card glass shadow-glow" style={{ maxWidth: '800px', margin: '2rem auto', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative background glow */}
      <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(0, 212, 200, 0.05) 0%, transparent 70%)', zIndex: 0 }}></div>

      <div className="card-header" style={{ position: 'relative', zIndex: 1, marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 className="text-gradient font-display" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '32px' }}>🤖</span> AI Voice Assistant
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          Real-time neural text-to-speech with dynamic voice cloning.
        </p>
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <label className="form-label">Voice Selection</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: isConnected ? 'var(--success)' : 'var(--text-muted)' }}>
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
            {isConnected ? 'System Ready' : 'Connecting...'}
          </div>
        </div>

        {/* Voice Search and Filter Bar */}
        <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search all voices..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 35px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: '14px' }}
            />
          </div>
          
          <select
            value={selectedVoice}
            onChange={e => setSelectedVoice(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '14px', minWidth: '180px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
          >
            <option value="auto">✨ AI Auto-Select</option>
            <optgroup label="All Available Voices">
              {voices.map(v => (
                <option key={v.name} value={v.name}>
                  {v.name.replace(/_/g, ' ')} {v.style ? `[${v.style}]` : ''}
                </option>
              ))}
            </optgroup>
          </select>

          <div 
            onClick={() => setUseTurbo(!useTurbo)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              cursor: 'pointer', 
              padding: '8px 14px', 
              borderRadius: '20px', 
              background: useTurbo ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${useTurbo ? '#f59e0b' : 'var(--border)'}`,
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '14px' }}>{useTurbo ? '🚀' : '🐢'}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: useTurbo ? '#f59e0b' : 'var(--text-secondary)' }}>
              {useTurbo ? 'Turbo Mode (Faster)' : 'Turbo Mode'}
            </span>
          </div>
        </div>

        <div className="voice-selector-container">
          {/* ── AI Auto card ────────────────────────────────────────────── */}
          <div className="voice-group">
            <div className="voice-group-header">
              <span className="voice-group-icon">✨</span>
              <span className="voice-group-label">Intelligence</span>
            </div>
            <div className="voice-grid">
              <div
                className={`voice-card ai-auto-card ${selectedVoice === 'auto' ? 'active' : ''}`}
                onClick={() => setSelectedVoice('auto')}
                role="button"
                aria-pressed={selectedVoice === 'auto'}
              >
                <div className="voice-card-left">
                  <span className="voice-card-name">AI Auto-Select</span>
                  <span className="voice-card-meta">
                    <span className="voice-badge voice-badge--ai">AUTO</span>
                    <span className="voice-tag">Dynamic</span>
                  </span>
                </div>
                {selectedVoice === 'auto' && <span className="voice-check">✓</span>}
              </div>
            </div>
          </div>

          {/* ── Grouped voice cards ───────────────────────────────────────── */}
          {groups.map(({ label, icon, voices: gVoices }) => (
            <div key={label} className="voice-group">
              <div className="voice-group-header">
                <span className="voice-group-icon">{icon}</span>
                <span className="voice-group-label">{label}</span>
                <span className="voice-group-count">{gVoices.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())).length}</span>
              </div>
              <div className="voice-grid">
                {gVoices.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())).map(v => (
                  <div
                    key={v.name}
                    className={`voice-card ${selectedVoice === v.name ? 'active' : ''}`}
                    onClick={() => setSelectedVoice(v.name)}
                    role="button"
                    aria-pressed={selectedVoice === v.name}
                  >
                    <div className="voice-card-left">
                      <span className="voice-card-name">
                        {v.name.replace(/_/g, ' ')}
                      </span>
                      <span className="voice-card-meta">
                        <span className={`voice-badge voice-badge--${v.gender}`}>
                          {genderLabel(v.gender)}
                        </span>
                        {v.style && <span className="voice-tag">{v.style}</span>}
                      </span>
                    </div>
                    <div className="voice-card-right">
                      {selectedVoice === v.name && (
                        <span className="voice-check">✓</span>
                      )}
                      <button
                        className={`voice-preview-btn ${isPreviewing === v.name ? 'previewing' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handlePreview(v.name); }}
                        title={
                          isPreviewLoading === v.name ? 'Loading…'
                            : isPreviewing === v.name ? 'Stop preview'
                              : 'Preview voice'
                        }
                      >
                        {isPreviewLoading === v.name ? '⏳'
                          : isPreviewing === v.name ? '⏹️'
                            : '▶️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Selected voice summary bar ──────────────────────────────────── */}
        <div className="voice-selected-bar">
          {selectedVoice === 'auto' ? (
            <>
              <span className="voice-selected-icon">✨</span>
              <span className="voice-selected-name">AI Auto-Select</span>
              <span className="voice-selected-detail">Dynamic context switching</span>
            </>
          ) : selectedVoiceObj ? (
            <>
              <span className="voice-selected-icon">{genderIcon(selectedVoiceObj.gender)}</span>
              <span className="voice-selected-name">{selectedVoiceObj.name.replace(/_/g, ' ')}</span>
              <span className={`voice-badge voice-badge--${selectedVoiceObj.gender}`}>
                {genderLabel(selectedVoiceObj.gender)}
              </span>
              {selectedVoiceObj.style && (
                <span className="voice-tag">{selectedVoiceObj.style}</span>
              )}
            </>
          ) : (
            <span className="voice-selected-detail">No voice selected</span>
          )}
        </div>
      </div>

      <div className="form-group" style={{ position: 'relative', zIndex: 1 }}>
        <label className="form-label">Message Content</label>
        <div style={{ position: 'relative' }}>
          <textarea
            className="form-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type something or use the microphone..."
            rows={4}
            style={{ fontSize: '16px', borderRadius: '12px', paddingRight: '50px' }}
          />
          <button
            className={`mic-btn ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={status === 'thinking' || status === 'speaking' || isTranscribing}
            title={isRecording ? "Stop Recording" : "Start Voice Input"}
          >
            {isRecording ? '🛑' : '🎤'}
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '12px', marginTop: '12px' }}>
        <button
          className={`btn ${status === 'idle' ? 'btn-primary' : 'btn-dark'} btn-lg`}
          onClick={handleSpeak}
          disabled={!isConnected || !text.trim() || status === 'thinking' || status === 'speaking'}
          style={{ flex: 1, height: '56px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {status === 'thinking' ? (
            <>
              <span className="spinner-small"></span>
              Thinking...
            </>
          ) : status === 'speaking' ? (
            '🗣️ Speaking...'
          ) : (
            'Synthesize & Speak'
          )}
        </button>

        {status === 'speaking' && (
          <button
            className="btn btn-secondary btn-lg"
            onClick={handleStop}
            style={{ width: '56px', height: '56px', borderRadius: '12px', padding: '0' }}
            title="Stop Playback"
          >
            ⏹️
          </button>
        )}
      </div>

      {status === 'speaking' && (
        <div className="waveform-container">
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
          <div className="waveform-bar"></div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: '20px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: '12px', color: 'var(--error)', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>⚠️ {errorMessage}</div>
          <button className="btn btn-sm btn-secondary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      <style>{`
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.online {
          background: var(--success);
          box-shadow: 0 0 10px var(--success);
        }
        .status-dot.offline {
          background: var(--text-muted);
        }
        
        /* ── Voice selector container ───────────────────────────────────── */
        .voice-selector-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-height: 420px;
          overflow-y: auto;
          padding-right: 6px;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .voice-selector-container::-webkit-scrollbar { width: 4px; }
        .voice-selector-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        /* ── Group header ───────────────────────────────────────────────── */
        .voice-group-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 10px;
        }
        .voice-group-icon { font-size: 13px; }
        .voice-group-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .voice-group-count {
          font-size: 10px;
          background: rgba(255,255,255,0.07);
          color: var(--text-muted);
          border-radius: 20px;
          padding: 1px 7px;
          margin-left: 2px;
        }

        /* ── Voice grid ─────────────────────────────────────────────────── */
        .voice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
        }

        /* ── Voice card ─────────────────────────────────────────────────── */
        .voice-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
          gap: 8px;
        }
        .voice-card:hover {
          background: rgba(255,255,255,0.065);
          border-color: rgba(0,212,200,0.4);
        }
        .voice-card.active {
          background: rgba(0,212,200,0.08);
          border-color: var(--teal);
          box-shadow: 0 0 0 1px rgba(0,212,200,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .ai-auto-card.active {
          background: linear-gradient(135deg, rgba(0,212,200,0.12) 0%, rgba(124,58,237,0.12) 100%);
          border-color: var(--teal);
        }

        /* ── Card internals ─────────────────────────────────────────────── */
        .voice-card-left  { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .voice-card-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

        .voice-card-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: capitalize;
        }
        .voice-card-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }

        /* ── Badges ─────────────────────────────────────────────────────── */
        .voice-badge {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          border-radius: 4px;
          padding: 2px 6px;
          white-space: nowrap;
        }
        .voice-badge--female  { background: rgba(236,72,153,0.15); color: #f472b6; }
        .voice-badge--male    { background: rgba(59,130,246,0.15);  color: #60a5fa; }
        .voice-badge--unknown,
        .voice-badge--ai      { background: rgba(124,58,237,0.15);  color: #a78bfa; }

        /* ── Style tag ──────────────────────────────────────────────────── */
        .voice-tag {
          font-size: 10px;
          color: var(--text-muted);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 4px;
          padding: 1px 6px;
          text-transform: capitalize;
          white-space: nowrap;
        }

        /* ── Selected checkmark ─────────────────────────────────────────── */
        .voice-check {
          font-size: 13px;
          color: var(--teal);
          font-weight: 700;
          line-height: 1;
        }

        /* ── Preview button ─────────────────────────────────────────────── */
        .voice-preview-btn {
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          padding: 5px;
          border-radius: 7px;
          transition: background 0.18s, box-shadow 0.18s;
          line-height: 1;
        }
        .voice-preview-btn:hover { background: rgba(255,255,255,0.1); }
        .voice-preview-btn.previewing {
          color: var(--teal);
          background: rgba(0,212,200,0.12);
          box-shadow: 0 0 0 2px rgba(0,212,200,0.4);
          animation: previewPulse 1.2s ease-in-out infinite;
        }
        @keyframes previewPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(0,212,200,0.4); }
          50%       { box-shadow: 0 0 0 5px rgba(0,212,200,0.1); }
        }

        /* ── Selected voice summary bar ─────────────────────────────────── */
        .voice-selected-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          padding: 10px 14px;
          background: rgba(0,212,200,0.05);
          border: 1px solid rgba(0,212,200,0.15);
          border-radius: 10px;
          font-size: 13px;
        }
        .voice-selected-icon { font-size: 16px; }
        .voice-selected-name {
          font-weight: 600;
          color: var(--text-primary);
          text-transform: capitalize;
          margin-right: 2px;
        }
        .voice-selected-detail { color: var(--text-muted); font-size: 12px; }

        .waveform-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 60px;
          margin-top: 24px;
        }
        
        .waveform-bar {
          width: 4px;
          height: 20px;
          background: var(--teal);
          border-radius: 4px;
          animation: wave 1s ease-in-out infinite;
        }
        
        .waveform-bar:nth-child(1) { animation-delay: 0.0s; height: 30px; }
        .waveform-bar:nth-child(2) { animation-delay: 0.1s; height: 45px; }
        .waveform-bar:nth-child(3) { animation-delay: 0.2s; height: 25px; }
        .waveform-bar:nth-child(4) { animation-delay: 0.3s; height: 50px; }
        .waveform-bar:nth-child(5) { animation-delay: 0.4s; height: 35px; }
        .waveform-bar:nth-child(6) { animation-delay: 0.5s; height: 40px; }
        .waveform-bar:nth-child(7) { animation-delay: 0.6s; height: 20px; }
        .waveform-bar:nth-child(8) { animation-delay: 0.7s; height: 30px; }
        
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1.5); opacity: 1; }
        }

        .mic-btn {
          position: absolute;
          right: 12px;
          bottom: 12px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.05);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: all 0.2s;
          z-index: 2;
        }
        .mic-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: var(--teal);
        }
        .mic-btn.recording {
          background: rgba(239, 68, 68, 0.2);
          border-color: var(--error);
          animation: micPulse 1.5s infinite;
        }
        @keyframes micPulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .spinner-small {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
