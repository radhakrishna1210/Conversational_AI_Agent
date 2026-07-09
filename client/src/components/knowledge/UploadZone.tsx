import { useState, useRef } from 'react';
import { UploadCloud, File, CheckCircle2, Loader2, X } from 'lucide-react';

interface UploadZoneProps {
  onCancel: () => void;
}

export function UploadZone({ onCancel }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const simulateUpload = () => {
    setUploading(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 15;
      if (p >= 100) {
        clearInterval(interval);
        setProgress(100);
        setUploading(false);
        setDone(true);
      } else {
        setProgress(p);
      }
    }, 300);
  };

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '24px', position: 'relative' }}>
      <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
        <X size={20} />
      </button>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#fff' }}>Upload PDF Documents</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Upload manuals, guides, or any PDF document to extract knowledge.</p>
      </div>

      {!files.length ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? '#00bcd4' : '#2a2a2a'}`,
            borderRadius: '12px',
            background: isDragging ? '#00bcd40a' : '#111',
            padding: '40px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <input type="file" accept=".pdf" multiple hidden ref={fileRef} onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <UploadCloud size={32} style={{ color: isDragging ? '#00bcd4' : '#555', marginBottom: '16px' }} />
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Drag and drop PDFs here</div>
          <div style={{ fontSize: '13px', color: '#666' }}>or click to browse from your computer</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: '#1a1a1a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00bcd4' }}>
                <File size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>{f.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>{(f.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              {done ? (
                <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
              ) : uploading ? (
                <Loader2 size={20} style={{ color: '#00bcd4', animation: 'spin 1s linear infinite' }} />
              ) : (
                <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Remove</button>
              )}
            </div>
          ))}

          {uploading && (
            <div style={{ width: '100%', height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#00bcd4', transition: 'width 0.3s' }} />
            </div>
          )}

          {!done && (
            <button
              onClick={simulateUpload}
              disabled={uploading}
              style={{
                marginTop: '8px',
                padding: '12px',
                background: uploading ? '#1a1a1a' : '#00bcd4',
                color: uploading ? '#888' : '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              {uploading ? 'Processing Documents...' : 'Upload & Process'}
            </button>
          )}

          {done && (
            <button
              onClick={onCancel}
              style={{
                marginTop: '8px',
                padding: '12px',
                background: '#1a1a1a',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          )}
        </div>
      )}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
