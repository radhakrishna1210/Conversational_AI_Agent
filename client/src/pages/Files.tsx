import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { whapi, getAuth } from '../lib/whapi';
import { RzEmpty, RzPill, RzSkeleton } from '@/components/rz';

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

/**
 * The three-letter plate that fronts each row.
 *
 * The design gives every file type its own tinted mark rather than an emoji —
 * emoji render at a different weight on every platform and carry no meaning to
 * a screen reader, while the extension is the thing you actually scan for.
 */
const extOf = (name: string, mime: string) => {
  const fromName = name.split('.').pop()?.toUpperCase();
  if (fromName && fromName.length <= 4 && fromName !== name.toUpperCase()) return fromName;
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('csv')) return 'CSV';
  if (mime.includes('json')) return 'JSON';
  return 'DOC';
};

const markClass = (ext: string) =>
  ext === 'PDF' ? 'rz-mark-coral'
  : ext === 'CSV' ? 'rz-mark-lime'
  : ext === 'JSON' ? 'rz-mark-violet'
  : 'rz-mark-neutral';

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

  const grounded = files.filter((f) => f.hasText).length;

  return (
    <div className="rz-page rz-page-pad rz-bleed">
      <div className="rz-wrap">
        <div className="rz-head">
          <div>
            <div className="rz-eyebrow">Workspace</div>
            <h1 className="rz-h1">Knowledge base</h1>
            <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 620 }}>
              Files here are shared with every agent in the workspace — uploads from Edit Agent → Knowledge Base
              appear here too. Agents ground answers strictly in what you upload.
            </p>
          </div>
          <div className="rz-head-actions">
            <span className="rz-mono">{files.length} files · {grounded} searchable</span>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); uploadFiles(e.dataTransfer.files); }}
          style={{
            border: `1.5px dashed ${isDragging ? 'var(--cyan)' : 'var(--line-2)'}`,
            background: isDragging ? 'rgba(14,179,158,0.07)' : 'var(--s1)',
            borderRadius: 16,
            padding: '30px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color .15s ease, background .15s ease',
          }}
        >
          <input
            ref={inputRef} type="file" multiple style={{ display: 'none' }}
            accept=".pdf,.txt,.md,.csv,.json,.docx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
          />
          <div
            style={{
              width: 52, height: 52, margin: '0 auto', borderRadius: 14,
              background: 'rgba(14,179,158,0.1)', display: 'grid', placeItems: 'center', color: 'var(--cyan-fg)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="rz-title-lg" style={{ marginTop: 14, fontSize: 17 }}>
            {uploading ? 'Uploading…' : 'Drop knowledge-base files here'}
          </div>
          <div className="rz-sub" style={{ marginTop: 6 }}>
            PDF, TXT, MD, CSV, JSON or DOCX · up to 10 MB each
          </div>
          <button type="button" className="rz-btn rz-btn-primary" style={{ marginTop: 16 }} disabled={uploading}>
            Browse files
          </button>
        </div>

        {/* List */}
        <div style={{ marginTop: 22 }}>
          {loading ? (
            <RzSkeleton rows={4} height={58} />
          ) : error ? (
            <div
              className="rz-card rz-between"
              style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--err)', fontSize: 13 }}
            >
              <span>Couldn’t load your files: {error}</span>
              <button className="rz-btn rz-btn-danger rz-btn-sm" onClick={load}>Retry</button>
            </div>
          ) : files.length === 0 ? (
            <RzEmpty
              title="No files yet"
              text="Upload documents above to build your agents’ knowledge base. Anything you add is searchable by every agent in this workspace."
            />
          ) : (
            <>
              <div className="rz-files-head rz-label">
                <span />
                <span>Name</span>
                <span>Type</span>
                <span>Scope</span>
                <span>Status</span>
                <span />
              </div>
              <div className="rz-stack-sm">
                {files.map((f) => {
                  const ext = extOf(f.fileName, f.mimeType);
                  return (
                    <div key={f.id} className="rz-files-row rz-card" style={{ padding: '13px 14px', borderRadius: 12 }}>
                      <span className={`rz-mark ${markClass(ext)}`} style={{ width: 30, height: 30, borderRadius: 8, fontFamily: 'var(--ff-m)', fontSize: 9.5, fontWeight: 600 }}>
                        {ext}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="rz-truncate" style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--tx)' }} title={f.fileName}>
                          {f.fileName}
                        </div>
                        <div className="rz-mono-xs">
                          {fmtSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="rz-sub" style={{ fontSize: 12.5 }}>{ext}</div>
                      <div className="rz-sub" style={{ fontSize: 12.5 }}>
                        {f.agentId ? 'One agent' : 'Workspace'}
                      </div>
                      <div>
                        {f.hasText
                          ? <RzPill tone="ok">Indexed</RzPill>
                          : <RzPill tone="warn">No text</RzPill>}
                      </div>
                      <div className="rz-cluster-sm" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        <button className="rz-btn rz-btn-ghost rz-btn-sm" onClick={() => handleDownload(f)}>Download</button>
                        <button
                          className="rz-icon-btn"
                          onClick={() => handleDelete(f)}
                          aria-label={`Delete ${f.fileName}`}
                          style={{ width: 30, height: 30, color: 'var(--err)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/*
        One grid definition, shared by the header and the rows, so the columns
        cannot drift apart. Below 900px the metadata columns fold away and each
        row becomes mark + name + actions — the three things you need to find
        and remove a file on a phone.
      */}
      <style>{`
        .rz-files-head,
        .rz-files-row {
          display: grid;
          grid-template-columns: 36px minmax(0, 1.8fr) 0.7fr 0.8fr 0.8fr auto;
          gap: 10px;
          align-items: center;
        }
        .rz-files-head { padding: 4px 14px 10px; }
        @media (max-width: 900px) {
          .rz-files-head { display: none; }
          .rz-files-row { grid-template-columns: 36px minmax(0, 1fr) auto; }
          .rz-files-row > :nth-child(3),
          .rz-files-row > :nth-child(4),
          .rz-files-row > :nth-child(5) { display: none; }
        }
      `}</style>
    </div>
  );
}
