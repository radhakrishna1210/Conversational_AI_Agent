import React, { useState, useEffect, useRef } from 'react';
import { whapi } from '../lib/whapi';
import { 
  Loader2, 
  Sparkles, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Mic, 
  Square,
  Upload
} from 'lucide-react';

interface VoiceClone {
  id: string;
  name: string;
  voiceId: string;
  provider: string;
  gender: string;
  language: string;
  description?: string;
  status: string;
  createdAt: string;
}

export default function CloneVoice() {
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  
  // Form State
  const [voiceName, setVoiceName] = useState('');
  const [gender, setGender] = useState('Neutral');
  const [language, setLanguage] = useState('English');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('elevenlabs');
  const [file, setFile] = useState<File | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);

  // Recording State
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'prompt' | 'recording' | 'ready'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingSecondsRef = useRef(0);

  // Page Operations State
  const [voiceClones, setVoiceClones] = useState<VoiceClone[]>([]);
  const [loadingClones, setLoadingClones] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchClones();
  }, []);

  useEffect(() => {
    let interval: any;
    if (recording) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recording]);

  const getAudioDuration = (audioFile: File) => new Promise<number>((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(audioFile);

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read audio duration'));
    };
    audio.src = url;
  });

  const fetchClones = async () => {
    try {
      setLoadingClones(true);
      const data = await whapi.get<VoiceClone[]>('/voice-clones');
      setVoiceClones(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch voice clones: ' + err.message);
    } finally {
      setLoadingClones(false);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setRecordingStatus('prompt');
      setAudioBlob(null);
      setFile(null);
      setAudioDurationSeconds(null);
      chunksRef.current = [];
      recordingSecondsRef.current = 0;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const duration = recordingSecondsRef.current;
        setAudioBlob(blob);
        setFile(new File([blob], 'recording.wav', { type: 'audio/wav' }));
        setAudioDurationSeconds(duration);
        setRecordingStatus('ready');
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingStatus('recording');
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
    } catch (err: any) {
      console.error('Failed to start recording', err);
      setError('Microphone access denied or not supported');
      setRecordingStatus('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      try {
        const duration = await getAudioDuration(selectedFile);
        if (duration < 20) {
          setError('Audio sample must be at least 20 seconds long');
          return;
        }
        if (duration > 120) {
          setError('Uploaded audio must be 2 minutes or shorter');
          return;
        }
        setAudioDurationSeconds(duration);
      } catch (err: any) {
        setError(err.message || 'Unable to read audio duration');
        return;
      }
      setFile(selectedFile);
      setAudioBlob(null);
      setError(null);
    }
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!voiceName.trim()) {
      setError('Please provide a name for the voice clone');
      return;
    }

    if (!file) {
      setError('Please record an audio sample or upload an audio file first');
      return;
    }

    const duration = audioDurationSeconds ?? recordingSeconds;
    if (duration < 20) {
      setError('Audio sample must be at least 20 seconds long');
      return;
    }
    if (duration > 120) {
      setError('Audio sample must be 2 minutes or shorter');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('name', voiceName);
      formData.append('gender', gender);
      formData.append('language', language);
      formData.append('description', description);
      formData.append('provider', provider);
      formData.append('durationMs', String(Math.round(duration * 1000)));
      formData.append('source', activeTab);

      await whapi.postForm('/voice-clones', formData);
      
      setSuccess(`Voice "${voiceName}" successfully cloned!`);
      setVoiceName('');
      setDescription('');
      setFile(null);
      setAudioBlob(null);
      setAudioDurationSeconds(null);
      setRecordingStatus('idle');
      
      // Refresh list
      fetchClones();
    } catch (err: any) {
      console.error(err);
      setError('Cloning failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      {/* Header Section */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Clone Voice</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Create custom AI voices by uploading audio samples. Minimum 20 seconds, recommended 30-60 seconds of clear speech.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.2)', 
          borderRadius: '8px', 
          padding: '16px', 
          color: '#f87171', 
          display: 'flex', 
          alignItems: 'start', 
          gap: '12px', 
          marginBottom: '24px',
          fontSize: '14px'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div style={{ 
          background: 'rgba(16, 185, 129, 0.1)', 
          border: '1px solid rgba(16, 185, 129, 0.2)', 
          borderRadius: '8px', 
          padding: '16px', 
          color: '#34d399', 
          display: 'flex', 
          alignItems: 'start', 
          gap: '12px', 
          marginBottom: '24px',
          fontSize: '14px'
        }}>
          <Check size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{success}</div>
        </div>
      )}

      {/* Main Clone Box */}
      <form onSubmit={handleCloneSubmit} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '32px', background: 'rgba(255,255,255,0.01)', marginBottom: '32px' }}>
        
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          <Sparkles size={20} style={{ color: 'var(--teal)' }} /> Clone Your Voice
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
          Upload an audio sample or record directly from your microphone. Speak clearly with minimal background noise for best results.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button 
            type="button"
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: activeTab === 'record' ? 'rgba(0, 212, 200, 0.1)' : 'transparent',
              borderColor: activeTab === 'record' ? 'var(--teal)' : 'var(--border)',
              color: activeTab === 'record' ? 'white' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onClick={() => setActiveTab('record')}
          >
            <Mic size={15} /> Record Voice
          </button>
          <button 
            type="button"
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: activeTab === 'upload' ? 'rgba(0, 212, 200, 0.1)' : 'transparent',
              borderColor: activeTab === 'upload' ? 'var(--teal)' : 'var(--border)',
              color: activeTab === 'upload' ? 'white' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={15} /> Upload File
          </button>
        </div>

        {activeTab === 'record' && (
          <div style={{
            marginBottom: '18px',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {recordingStatus === 'prompt' && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--teal)' }} />}
            {recordingStatus === 'recording' && <Mic size={16} style={{ color: '#ef4444' }} />}
            {recordingStatus === 'ready' && <Check size={16} style={{ color: '#34d399' }} />}
            {recordingStatus === 'idle' && <Mic size={16} style={{ color: 'var(--teal)' }} />}
            <span>
              {recordingStatus === 'prompt' && 'Waiting for microphone access...'}
              {recordingStatus === 'recording' && `Recording in progress: ${formatTime(recordingSeconds)}`}
              {recordingStatus === 'ready' && `Sample captured: ${file?.name || 'voice sample'}`}
              {recordingStatus === 'idle' && 'Press Record Voice to start a new sample.'}
            </span>
          </div>
        )}

        {/* Recording Area */}
        {activeTab === 'record' && (
          <div style={{ 
            border: '1px dashed var(--border)', 
            borderRadius: '8px', 
            padding: '48px 24px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            background: 'rgba(0,0,0,0.15)',
            marginBottom: '32px'
          }}>
            {!recording ? (
              <>
                <button
                  type="button"
                  onClick={startRecording}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(0, 212, 200, 0.1)',
                    border: '2px solid var(--teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--teal)',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <Mic size={28} />
                </button>
                <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '4px' }}>
                  {audioBlob ? 'Sample Recorded!' : 'Click to start recording'}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                  {audioBlob ? `Duration: ${formatTime(recordingSeconds)} • Ready to clone` : 'Speak clearly • at least 20 seconds'}
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={stopRecording}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '2px solid #ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    animation: 'pulse 1.5s infinite'
                  }}
                >
                  <Square size={24} fill="#ef4444" />
                </button>
                <h4 style={{ fontSize: '15px', color: '#ef4444', fontWeight: 700, marginBottom: '4px' }}>Recording...</h4>
                <p style={{ color: 'white', fontSize: '24px', fontWeight: 700, marginBottom: '24px', fontFamily: 'monospace' }}>
                  {formatTime(recordingSeconds)}
                </p>
              </>
            )}
            
            <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>🤫 Quiet room</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📏 15-30 cm away</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>🗣️ Normal pace</span>
            </div>
          </div>
        )}

        {/* Upload Area */}
        {activeTab === 'upload' && (
          <div style={{ 
            border: '1px dashed var(--border)', 
            borderRadius: '8px', 
            padding: '44px 24px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            background: 'rgba(0,0,0,0.15)',
            marginBottom: '32px',
            position: 'relative',
            cursor: 'pointer'
          }}>
            <input 
              type="file" 
              accept="audio/*" 
              onChange={handleFileChange}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer'
              }}
            />
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>☁️</div>
            <p style={{ color: 'white', fontWeight: 600, marginBottom: '8px' }}>
              {file ? file.name : 'Click to upload or drag and drop'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'MP3, WAV up to 10MB'}
            </p>
          </div>
        )}

        {/* Form Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Voice Name *</label>
            <input 
              type="text" 
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="form-input" 
              placeholder="e.g. My Professional Voice" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} 
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Provider *</label>
            <select 
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="form-select" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}
            >
              <option value="elevenlabs">ElevenLabs (Premium, Immediate)</option>
              <option value="sarvam">Sarvam AI (Multilingual, India)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Gender *</label>
            <select 
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="form-select" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}
            >
              <option value="Neutral">Neutral</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Language *</label>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="form-select" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}
            >
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-input" 
              placeholder="Describe this voice or its intended use..." 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', minHeight: '80px', resize: 'vertical' }}
            ></textarea>
          </div>
        </div>

        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Cloning Voice & Deploying AI Model...
            </>
          ) : (
            <>
              <Mic size={18} />
              Clone Voice
            </>
          )}
        </button>
      </form>

      {/* Voice Library Section */}
      <div style={{ marginTop: '48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Voice Library</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Your custom cloned voices ready to be assigned to AI agents</p>
          </div>
          <button 
            onClick={fetchClones} 
            className="btn" 
            style={{ padding: '8px', border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifySelf: 'center' }}
            title="Refresh Library"
          >
            <RefreshCw size={16} className={loadingClones ? "animate-spin" : ""} />
          </button>
        </div>

        {loadingClones ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--teal)' }} />
          </div>
        ) : voiceClones.length === 0 ? (
          /* Empty State */
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ 
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              marginBottom: '16px',
              fontSize: '24px'
            }}>
              🎙️
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>No Cloned Voices Yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', maxWidth: '380px' }}>
              Upload your first audio sample or record clear speech above to create a custom AI voice library.
            </p>
          </div>
        ) : (
          /* Library Grid */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {voiceClones.map(clone => (
              <div 
                key={clone.id}
                style={{ 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  padding: '20px', 
                  background: 'rgba(255,255,255,0.015)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{clone.name}</h4>
                    <span style={{ 
                      fontSize: '11px', 
                      background: clone.status === 'ready' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: clone.status === 'ready' ? '#34d399' : '#fbbf24',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      border: clone.status === 'ready' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)'
                    }}>
                      {clone.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                      {clone.provider}
                    </span>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                      {clone.gender}
                    </span>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                      {clone.language}
                    </span>
                  </div>

                  {clone.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.4', margin: 0 }}>
                      {clone.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: 'auto' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Created {new Date(clone.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
