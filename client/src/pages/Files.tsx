import React, { useEffect, useRef, useState } from 'react';
import { whapi } from '../lib/whapi';

interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  filePath: string;
  contentText: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function Files() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    try {
      const result = await whapi.get<{ documents: KnowledgeDocument[] }>('/knowledge');
      setDocuments(result.documents || []);
      if (!selectedDocument && result.documents?.length) {
        setSelectedDocument(result.documents[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const uploadFiles = async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    if (!fileArray.length) return;

    const accepted = fileArray.filter((f) => /\.(pdf|txt|md|csv|json|html?|rtf)$/i.test(f.name));
    if (accepted.length < fileArray.length) {
      setError('Only PDF, TXT, MD, CSV, JSON, and HTML files are supported.');
    }

    setIsUploading(true);
    setError('');
    try {
      for (const file of accepted) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace(/\.[^.]+$/, ''));
        await whapi.postForm('/knowledge/upload', formData);
      }
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      await whapi.delete(`/knowledge/${documentId}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString();
  const formatSize = (text: string) => {
    const bytes = new Blob([text || '']).size;
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>Knowledge Base</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '6px' }}>
          Upload documents once and your agent will use them in chat and web call responses.
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(244,67,54,0.12)', color: '#ff8787', border: '1px solid rgba(244,67,54,0.25)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              border: `1px dashed ${isDragging ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: '8px',
              background: isDragging ? 'rgba(0, 212, 200, 0.05)' : 'rgba(255,255,255,0.01)',
              padding: '24px',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              opacity: isUploading ? 0.7 : 1,
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', marginBottom: '24px', color: 'white' }}>
              <span style={{ fontSize: '16px' }}>↑</span> Upload documents
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(0, 212, 200, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--teal)',
                marginBottom: '16px',
                fontSize: '20px',
              }}>
                📄
              </div>
              <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>
                Drag and drop a file here, or click to select
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Supported formats: PDF, TXT, MD, CSV, JSON, HTML
              </p>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.txt,.md,.csv,.json,.html,.htm"
                multiple
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', padding: '24px', minHeight: '200px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', marginBottom: '24px', color: 'white' }}>
              <span style={{ fontSize: '16px' }}>📄</span> Uploaded Documents
            </h3>

            {documents.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No documents uploaded yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocument(doc)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '6px',
                      background: selectedDocument?.id === doc.id ? 'rgba(0, 212, 200, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${selectedDocument?.id === doc.id ? 'var(--teal)' : 'transparent'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '20px' }}>📄</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {doc.fileName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.01)',
          padding: '24px',
          height: '100%',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: selectedDocument ? 'flex-start' : 'center',
          justifyContent: selectedDocument ? 'flex-start' : 'center',
        }}>
          {!selectedDocument ? (
            <>
              <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '40px', opacity: 0.7 }}>📄</div>
              <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>No Document Selected</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select a document to view its details</p>
            </>
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', color: 'white', fontWeight: 600 }}>Document Details</h3>
                <button
                  onClick={() => setSelectedDocument(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <h4 style={{ fontSize: '15px', color: 'white', textAlign: 'center', wordBreak: 'break-all', marginBottom: '4px' }}>
                  {selectedDocument.title}
                </h4>
                <p style={{ color: 'var(--teal)', fontSize: '13px' }}>{formatSize(selectedDocument.contentText)}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>File name</div>
                  <div style={{ fontSize: '14px', color: 'white' }}>{selectedDocument.fileName}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Chunks</div>
                  <div style={{ fontSize: '14px', color: 'white' }}>{selectedDocument.chunkCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Uploaded</div>
                  <div style={{ fontSize: '14px', color: 'white' }}>{formatDate(selectedDocument.createdAt)}</div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleDelete(selectedDocument.id)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'rgba(255, 60, 60, 0.1)',
                      color: '#ff4d4d',
                      border: '1px solid rgba(255, 60, 60, 0.2)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    Delete
                  </button>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Preview</div>
                  <div style={{
                    maxHeight: '220px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: '#d7d7d7',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '12px',
                  }}>
                    {selectedDocument.contentText || 'No text could be extracted from this file.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

