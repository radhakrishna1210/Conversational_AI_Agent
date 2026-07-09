import { useState } from 'react';
import { StatCard } from './StatCard';
import { KnowledgeCard } from './KnowledgeCard';
import { KnowledgeTable } from './KnowledgeTable';
import { WebsiteImporter } from './WebsiteImporter';
import { UploadZone } from './UploadZone';
import { FAQEditor } from './FAQEditor';
import { NotesEditor } from './NotesEditor';
import { mockKnowledgeStats, mockKnowledgeSources, type SourceType } from '../../data/mockKnowledge';
import { Globe, File, MessageCircle, FileText, Blocks, LayoutGrid, Database, HardDrive, Inbox } from 'lucide-react';

export function KnowledgeBaseTab() {
  const [activeEditor, setActiveEditor] = useState<SourceType | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <StatCard label="Knowledge Sources" value={mockKnowledgeStats.totalSources} icon={Database} />
        <StatCard label="Documents" value={mockKnowledgeStats.documents} icon={FileText} />
        <StatCard label="Total Chunks" value={mockKnowledgeStats.chunks} icon={LayoutGrid} />
        <StatCard label="Storage Used" value={formatBytes(mockKnowledgeStats.storageUsedBytes)} icon={HardDrive} />
      </div>

      {/* Main Layout: Split Left (Sources) / Right (Details/Table) */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left: Knowledge Sources Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Add Knowledge</div>
          
          <KnowledgeCard 
            icon={Globe} title="Website" description="Crawl and extract text from public URLs." 
            onClick={() => setActiveEditor('website')} 
          />
          <KnowledgeCard 
            icon={File} title="PDF Documents" description="Upload manuals, guides, and docs." 
            onClick={() => setActiveEditor('pdf')} 
          />
          <KnowledgeCard 
            icon={MessageCircle} title="FAQs" description="Add structured Q&A pairs." 
            onClick={() => setActiveEditor('faq')} 
          />
          <KnowledgeCard 
            icon={FileText} title="Plain Text Notes" description="Write raw context and instructions." 
            onClick={() => setActiveEditor('notes')} 
          />
          <KnowledgeCard 
            icon={Blocks} title="Integrations" description="Connect Notion, Google Drive, etc." 
            onClick={() => {}} disabled 
          />
        </div>

        {/* Right: Active Editor OR Knowledge Table */}
        <div style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
          {activeEditor === 'website' && <WebsiteImporter onCancel={() => setActiveEditor(null)} />}
          {activeEditor === 'pdf' && <UploadZone onCancel={() => setActiveEditor(null)} />}
          {activeEditor === 'faq' && <FAQEditor onCancel={() => setActiveEditor(null)} />}
          {activeEditor === 'notes' && <NotesEditor onCancel={() => setActiveEditor(null)} />}
          
          {!activeEditor && mockKnowledgeSources.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Imported Sources</div>
              <KnowledgeTable sources={mockKnowledgeSources} />
            </div>
          )}

          {!activeEditor && mockKnowledgeSources.length === 0 && (
            <div style={{ flex: 1, border: '1px dashed #2a2a2a', borderRadius: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px' }}>
              <div style={{ width: '64px', height: '64px', background: '#111', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', marginBottom: '20px' }}>
                <Inbox size={32} />
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>No Knowledge Sources</div>
              <div style={{ fontSize: '14px', color: '#888', maxWidth: '300px', lineHeight: '1.5' }}>
                Your agent currently has no context. Add websites, PDFs, or notes from the left panel to get started.
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
