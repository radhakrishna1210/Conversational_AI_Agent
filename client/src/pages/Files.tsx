import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { whapi, getAuth } from '../lib/whapi';

// Unified file library — the SAME workspace-scoped store that Edit Agent →
// Knowledge Base uses (/workspaces/:id/files). A file uploaded in either
// place shows up in both. Server-persisted; nothing lives only in memory.
interface KbRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  agentId: string | null;
  hasText: boolean;
  createdAt: string;
}

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Files() {
  const [files, setFiles] = useState<KbRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await whapi.get<{ files: KbRecord[] }>('/files');
      setFiles(res?.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files from the server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const uploadFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUploading(true);
    for (const f of arr) {
      try {
        const form = new FormData();
        form.append('file', f);
        const res = await whapi.postForm<{ file: KbRecord; textExtracted: boolean }>('/files', form);
        toast.success(`${f.name} uploaded${res?.textExtracted ? '' : ' (no text extracted — won’t ground agent answers)'}`);
      } catch (err) {
        toast.error(err instanceof Error ? `${f.name}: ${err.message}` : `Failed to upload ${f.name}`);
      }
    }
    setUploading(false);
    load();
  };

  const handleDownload = async (f: KbRecord) => {
    try {
      const { token, workspaceId } = getAuth();
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/files/${f.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleDelete = async (f: KbRecord) => {
    if (!confirm(`Delete "${f.fileName}"? Agents using it for knowledge will lose access.`)) return;
    try {
      await whapi.del(`/files/${f.id}`);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      toast.success('File deleted');
    } catch (err) {
      toast.error('Failed to delete file');
    }
  };

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6, color: 'var(--text-primary, #fff)' }}>Files</h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14 }}>
          Your workspace knowledge library. Files here (PDF, TXT, MD, CSV, JSON, DOCX) are shared with your agents’ knowledge bases — uploads from Edit Agent → Knowledge Base appear here too.
        </p>
      </div>

      {/* Upload dropzone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); uploadFiles(e.dataTransfer.files); }}
        style={{
          border: `1px dashed ${isDragging ? 'var(--teal, #14b8a6)' : 'var(--border, #334155)'}`,
          background: isDragging ? 'rgba(20,184,166,0.06)' : 'rgba(255,255,255,0.01)',
          borderRadius: 12, padding: '44px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 28,
        }}
      >
        <input
          ref={inputRef} type="file" multiple style={{ display: 'none' }}
          accept=".pdf,.txt,.md,.csv,.json,.docx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
        />
        <div style={{ fontSize: 30, marginBottom: 10 }}>📁</div>
        <div style={{ color: 'var(--text-primary, #fff)', fontWeight: 600, marginBottom: 6 }}>
          {uploading ? 'Uploading…' : 'Click to upload or drag and drop'}
        </div>
        <div style={{ color: 'var(--text-muted, #64748b)', fontSize: 13 }}>PDF, TXT, MD, CSV, JSON, DOCX — up to 10MB each</div>
      </div>

      {/* List */}
      {loading ? (
        <p style={{ color: 'var(--text-muted, #94a3b8)' }}>Loading files…</p>
      ) : error ? (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
          Couldn’t load your files: {error}
          <button onClick={load} style={{ marginLeft: 12, background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : files.length === 0 ? (
        <div style={{ border: '1px solid var(--border, #334155)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🗂️</div>
          <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 16, marginBottom: 6 }}>No files yet</h3>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14 }}>Upload documents above to build your agents’ knowledge base.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', border: '1px solid var(--border, #334155)', borderRadius: 10, background: 'rgba(255,255,255,0.01)' }}>
              <span style={{ fontSize: 20 }}>{f.mimeType.includes('pdf') ? '📄' : f.mimeType.includes('csv') ? '📊' : '📝'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary, #fff)', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.fileName}>{f.fileName}</div>
                <div style={{ color: 'var(--text-muted, #64748b)', fontSize: 12 }}>
                  {fmtSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                  {f.agentId ? ' · linked to an agent' : ' · workspace-wide'}
                  {!f.hasText && ' · no text extracted'}
                </div>
              </div>
              <button onClick={() => handleDownload(f)} title="Download" style={{ background: 'transparent', border: '1px solid var(--border, #334155)', color: 'var(--text-secondary, #94a3b8)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>Download</button>
              <button onClick={() => handleDelete(f)} title="Delete" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15 }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
