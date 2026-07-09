import { useState, useMemo } from 'react';
import { SearchBar } from './SearchBar';
import { KnowledgeDrawer } from './KnowledgeDrawer';
import { Globe, File, MessageCircle, FileText, CheckCircle2, Clock, Trash2, RefreshCw } from 'lucide-react';
import type { KnowledgeSource, SourceType } from '../../data/mockKnowledge';

interface KnowledgeTableProps {
  sources: KnowledgeSource[];
}

const TYPE_CONFIG: Record<SourceType, { icon: React.ReactNode; color: string; label: string }> = {
  website: { icon: <Globe size={14} />, color: '#3b82f6', label: 'Website' },
  pdf:     { icon: <File size={14} />, color: '#ef4444', label: 'PDF' },
  faq:     { icon: <MessageCircle size={14} />, color: '#10b981', label: 'FAQ' },
  notes:   { icon: <FileText size={14} />, color: '#f59e0b', label: 'Notes' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return 'Today, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function KnowledgeTable({ sources: initialSources }: KnowledgeTableProps) {
  const [sources, setSources] = useState(initialSources);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KnowledgeSource | null>(null);

  const filtered = useMemo(() => {
    if (!search) return sources;
    const q = search.toLowerCase();
    return sources.filter(s => s.name.toLowerCase().includes(q) || s.type.includes(q));
  }, [sources, search]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this knowledge source?')) {
      setSources(s => s.filter(x => x.id !== id));
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    // simulate refresh
  };

  return (
    <>
      <KnowledgeDrawer source={selected} onClose={() => setSelected(null)} />
      
      <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ flex: 1, maxWidth: '300px' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search imported sources..." />
          </div>
          <div style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>
            {filtered.length} Source{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0a0a0a' }}>
                {['Name', 'Type', 'Status', 'Chunks', 'Last Updated', 'Actions'].map(th => (
                  <th key={th} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #1a1a1a' }}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
                    No knowledge sources found.
                  </td>
                </tr>
              ) : filtered.map(source => {
                const conf = TYPE_CONFIG[source.type];
                return (
                  <tr 
                    key={source.id} 
                    onClick={() => setSelected(source)}
                    style={{ borderBottom: '1px solid #141414', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#111'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: '600', color: '#e8e8e8' }}>
                      {source.name}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: conf.color, background: `${conf.color}15`, padding: '4px 8px', borderRadius: '6px' }}>
                        {conf.icon} {conf.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {source.status === 'synced' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#22c55e' }}>
                          <CheckCircle2 size={14} /> Synced
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#f59e0b' }}>
                          <Clock size={14} /> Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#888', fontWeight: '600' }}>
                      {source.chunkCount}
                    </td>
                    <td style={{ padding: '14px 20px', color: '#666' }}>
                      {fmtDate(source.updatedAt)}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelected(source); }}
                          style={{ padding: '4px 10px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#00bcd4', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          View
                        </button>
                        <button onClick={handleRefresh} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }} title="Sync Now">
                          <RefreshCw size={14} />
                        </button>
                        <button onClick={(e) => handleDelete(e, source.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.8 }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
