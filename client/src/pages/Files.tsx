import DashboardLayout from '../components/DashboardLayout';

export default function Files() {
  return (
    <DashboardLayout>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>File Management</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Upload Section */}
          <div style={{ 
            border: '1px dashed var(--border)', 
            borderRadius: '8px', 
            background: 'rgba(255,255,255,0.01)',
            padding: '24px'
          }}>
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
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '40px', opacity: 0.7 }}>
            📄
          </div>
          <h4 style={{ fontSize: '15px', color: 'white', marginBottom: '8px' }}>No File Selected</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select a file to view its details</p>
        </div>

      </div>
    </DashboardLayout>
  );
}
