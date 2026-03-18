import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';

export default function CloneVoice() {
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');

  return (
    <DashboardLayout>
      {/* Header Section */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Clone Voice</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Create custom AI voices by uploading audio samples. Minimum 20 seconds, recommended 30-60 seconds of clear speech.
        </p>
      </div>

      {/* Main Clone Box */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '32px', background: 'rgba(255,255,255,0.01)', marginBottom: '32px' }}>
        
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px' }}>🎙️</span> Clone Your Voice
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
          Upload an audio sample or record directly from your microphone. Speak clearly with minimal background noise for best results.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button 
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: activeTab === 'record' ? '#111827' : 'transparent',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => setActiveTab('record')}
          >
            🎙️ Record Voice
          </button>
          <button 
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: activeTab === 'upload' ? '#111827' : 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => setActiveTab('upload')}
          >
            ☁️ Upload File
          </button>
        </div>

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
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(0, 212, 200, 0.1)',
              border: '1px solid rgba(0, 212, 200, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--teal)',
              marginBottom: '16px',
              fontSize: '20px'
            }}>
              🎙️
            </div>
            <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '4px' }}>Click to start recording</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>Speak clearly • at least 20 seconds</p>
            
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
            padding: '60px 24px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            background: 'rgba(0,0,0,0.15)',
            marginBottom: '32px'
          }}>
             <div style={{ fontSize: '32px', marginBottom: '16px' }}>☁️</div>
             <p style={{ color: 'white', fontWeight: 600, marginBottom: '8px' }}>Click to upload or drag and drop</p>
             <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>MP3, WAV up to 10MB</p>
          </div>
        )}

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Voice Name *</label>
            <input type="text" className="form-input" placeholder="e.g. My Professional Voice" style={{ width: '100%', background: 'rgba(0,0,0,0.2)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Gender *</label>
            <select className="form-select" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}>
              <option>Female</option>
              <option>Male</option>
              <option>Neutral</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Language *</label>
            <select className="form-select" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', backgroundImage: 'none' }}>
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="form-input" placeholder="Describe this voice or its intended use..." style={{ width: '100%', background: 'rgba(0,0,0,0.2)', minHeight: '80px', resize: 'vertical' }}></textarea>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
          <span style={{ marginRight: '6px' }}>🎙️</span> Clone Voice
        </button>
      </div>

      {/* Empty State */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '32px' }}>
          🎙️
        </div>
        <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>No Cloned Voices Yet</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Upload your first audio sample above to create a custom AI voice.
        </p>
      </div>

    </DashboardLayout>
  );
}
