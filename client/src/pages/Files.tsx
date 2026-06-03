import React, { useState, useRef } from 'react';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  date: Date;
  previewUrl?: string;
}

export default function Files() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const pdfs = fileArray.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    
    if (pdfs.length < fileArray.length) {
      alert("Only PDF files are supported.");
    }

    const newUploadedFiles = pdfs.map(f => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      size: f.size,
      type: f.type || 'application/pdf',
      date: new Date(),
      previewUrl: URL.createObjectURL(f)
    }));

    setFiles(prev => [...prev, ...newUploadedFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>File Management</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Upload Section */}
          <div 
            style={{ 
              border: `1px dashed ${isDragging ? 'var(--teal)' : 'var(--border)'}`, 
              borderRadius: '8px', 
              background: isDragging ? 'rgba(0, 212, 200, 0.05)' : 'rgba(255,255,255,0.01)',
              padding: '24px',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', marginBottom: '24px', color: 'white' }}>
              <span style={{ fontSize: '16px' }}>↑</span> Upload PDFs
            </h3>
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '32px 0'
            }}>
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
                fontSize: '20px'
              }}>
                📄<span style={{ position: 'absolute', fontSize: '10px', marginTop: '4px', color: 'var(--bg-primary)', background: 'var(--teal)', borderRadius: '50%', padding: '1px 3px' }}>↑</span>
              </div>
              <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>Drag and drop a file here, or click to select</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Supported formats: PDF (max 10MB)</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="application/pdf"
                multiple 
                onChange={handleFileChange} 
              />
            </div>
          </div>

          {/* Uploaded Files Section */}
          <div style={{ 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            background: 'rgba(255,255,255,0.01)',
            padding: '24px',
            minHeight: '200px'
          }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', marginBottom: '24px', color: 'white' }}>
              <span style={{ fontSize: '16px' }}>📄</span> Uploaded Files
            </h3>
            
            {files.length === 0 ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                height: '100px',
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}>
                No files uploaded yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {files.map(file => (
                  <div 
                    key={file.id}
                    onClick={() => setSelectedFile(file)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '6px',
                      background: selectedFile?.id === file.id ? 'rgba(0, 212, 200, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${selectedFile?.id === file.id ? 'var(--teal)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontSize: '20px' }}>📄</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatSize(file.size)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column (Details) */}
        <div style={{ 
          border: '1px solid var(--border)', 
          borderRadius: '8px', 
          background: 'rgba(255,255,255,0.01)',
          padding: '24px',
          height: '100%',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: selectedFile ? 'flex-start' : 'center',
          justifyContent: selectedFile ? 'flex-start' : 'center'
        }}>
          {!selectedFile ? (
            <>
              <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '40px', opacity: 0.7 }}>
                📄
              </div>
              <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>No File Selected</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select a file to view its details</p>
            </>
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', color: 'white', fontWeight: 600 }}>File Details</h3>
                <button 
                  onClick={() => setSelectedFile(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
                >
                  Close
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <h4 style={{ fontSize: '15px', color: 'white', textAlign: 'center', wordBreak: 'break-all', marginBottom: '4px' }}>
                  {selectedFile.name}
                </h4>
                <p style={{ color: 'var(--teal)', fontSize: '13px' }}>{formatSize(selectedFile.size)}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</div>
                  <div style={{ fontSize: '14px', color: 'white' }}>{selectedFile.type}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Uploaded</div>
                  <div style={{ fontSize: '14px', color: 'white' }}>{selectedFile.date.toLocaleString()}</div>
                </div>
                
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                  {selectedFile.previewUrl && (
                    <a 
                      href={selectedFile.previewUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        flex: 1, 
                        textAlign: 'center', 
                        padding: '10px', 
                        background: 'var(--teal)', 
                        color: 'var(--bg-primary)', 
                        borderRadius: '6px', 
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                    >
                      Open PDF
                    </a>
                  )}
                  <button 
                    onClick={() => {
                      setFiles(files.filter(f => f.id !== selectedFile.id));
                      setSelectedFile(null);
                    }}
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      background: 'rgba(255, 60, 60, 0.1)', 
                      color: '#ff4d4d', 
                      border: '1px solid rgba(255, 60, 60, 0.2)', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
