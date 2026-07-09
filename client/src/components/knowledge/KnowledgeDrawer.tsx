import { memo } from 'react';
import { X, Globe, FileText, MessageCircle, File, CheckCircle2, Clock } from 'lucide-react';
import type { KnowledgeSource, SourceType } from '../../data/mockKnowledge';

interface KnowledgeDrawerProps {
  source: KnowledgeSource | null;
  onClose: () => void;
}

const TYPE_CONFIG: Record<SourceType, { icon: React.ReactNode; color: string; label: string }> = {
  website: { icon: <Globe size={14} />, color: '#3b82f6', label: 'Website' },
  pdf:     { icon: <File size={14} />, color: '#ef4444', label: 'PDF Document' },
  faq:     { icon: <MessageCircle size={14} />, color: '#10b981', label: 'FAQ' },
  notes:   { icon: <FileText size={14} />, color: '#f59e0b', label: 'Notes' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const KnowledgeDrawer = memo(function KnowledgeDrawer({ source, onClose }: KnowledgeDrawerProps) {
  if (!source) return null;

  const config = TYPE_CONFIG[source.type];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, animation: 'fadein 0.2s ease' }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '95vw',
        background: '#0a0a0a', borderLeft: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column',
        zIndex: 1200, animation: 'slidein 0.28s cubic-bezier(0.4,0,0.2,1)', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: '#080808' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600', color: config.color, background: `${config.color}15`, padding: '4px 8px', borderRadius: '12px' }}>
                {config.icon}
                {config.label}
              </span>
              {source.status === 'synced' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#22c55e', border: '1px solid #22c55e30', padding: '3px 8px', borderRadius: '12px' }}>
                  <CheckCircle2 size={12} /> Synced
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f59e0b', border: '1px solid #f59e0b30', padding: '3px 8px', borderRadius: '12px' }}>
                  <Clock size={12} /> Pending
                </span>
              )}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', lineHeight: 1.3 }}>{source.name}</div>
          </div>
          <button onClick={onClose} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Metadata Grid */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Source Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <MetaBox label="ID" value={source.id} mono />
              <MetaBox label="Size" value={`${(source.sizeBytes / 1024).toFixed(1)} KB`} />
              <MetaBox label="Extracted Chunks" value={source.chunkCount.toString()} />
              <MetaBox label="Last Updated" value={fmtDate(source.updatedAt)} />
              {source.type === 'website' && <MetaBox label="URL" value={source.url} />}
              {source.type === 'website' && <MetaBox label="Pages Scraped" value={source.pagesScraped.toString()} />}
              {source.type === 'pdf' && <MetaBox label="Pages" value={source.pages.toString()} />}
            </div>
          </div>

          {/* Chunk Preview */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Extracted Chunks</span>
              <span style={{ color: '#00bcd4' }}>{source.chunks.length} shown</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {source.chunks.map(chunk => (
                <div key={chunk.id} style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.6', marginBottom: '12px' }}>
                    {chunk.content}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #222', paddingTop: '12px' }}>
                    <span style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>{chunk.id}</span>
                    <span style={{ fontSize: '10px', color: '#888', background: '#1a1a1a', padding: '2px 6px', borderRadius: '4px' }}>{chunk.tokens} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      <style>{`
        @keyframes fadein  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
});

function MetaBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '12px' }}>
      <div style={{ fontSize: '10px', color: '#555', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#e0e0e0', fontWeight: '500', fontFamily: mono ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}
