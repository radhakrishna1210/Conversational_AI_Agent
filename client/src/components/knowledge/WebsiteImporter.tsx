import { useState } from 'react';
import { Globe, X, Loader2, CheckCircle2 } from 'lucide-react';

interface WebsiteImporterProps {
  onCancel: () => void;
}

export function WebsiteImporter({ onCancel }: WebsiteImporterProps) {
  const [url, setUrl] = useState('');
  const [includeSubpages, setIncludeSubpages] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleImport = () => {
    if (!url) return;
    setScraping(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 20;
      if (p >= 100) {
        clearInterval(interval);
        setProgress(100);
        setScraping(false);
        setDone(true);
      } else {
        setProgress(p);
      }
    }, 400);
  };

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '24px', position: 'relative' }}>
      <button onClick={onCancel} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
        <X size={20} />
      </button>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#fff' }}>Import Website</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Extract text content from any public website.</p>
      </div>

      {!scraping && !done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>Website URL</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '10px 14px' }}>
              <Globe size={16} style={{ color: '#555' }} />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', padding: '14px', borderRadius: '8px', border: '1px solid #222' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>Include Subpages</div>
              <div style={{ fontSize: '12px', color: '#666' }}>Crawl and extract links matching the domain</div>
            </div>
            <div onClick={() => setIncludeSubpages(!includeSubpages)} style={{ width: '40px', height: '24px', background: includeSubpages ? '#00bcd4' : '#333', borderRadius: '12px', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '10px', position: 'absolute', top: '2px', left: includeSubpages ? '18px' : '2px', transition: 'left 0.2s' }} />
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={!url}
            style={{
              padding: '12px',
              background: url ? '#00bcd4' : '#1a1a1a',
              color: url ? '#000' : '#555',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '14px',
              cursor: url ? 'pointer' : 'not-allowed'
            }}
          >
            Import Website
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', textAlign: 'center' }}>
          {done ? (
            <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: '16px' }} />
          ) : (
            <Loader2 size={48} style={{ color: '#00bcd4', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          )}
          
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>
            {done ? 'Website Imported Successfully' : 'Scraping Website...'}
          </div>
          
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '24px' }}>
            {done ? 'Extracted 24 pages and 142 chunks.' : `Processing ${url} and discovering subpages.`}
          </div>

          {scraping && (
            <div style={{ width: '100%', height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#00bcd4', transition: 'width 0.3s' }} />
            </div>
          )}

          {done && (
            <button
              onClick={onCancel}
              style={{
                width: '100%',
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
    </div>
  );
}
