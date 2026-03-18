import DashboardLayout from '../components/DashboardLayout';

export default function BulkCall() {
  return (
    <DashboardLayout>
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Bulk Call Campaigns</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Manage and monitor your bulk call campaigns.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            border: '1px solid var(--border)', 
            borderRadius: '6px', 
            padding: '6px 12px', 
            fontSize: '12px', 
            fontWeight: 600,
            color: 'white'
          }}>
            Total Concurrent Limit: 1
          </div>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Create New Campaign
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '40px 1.5fr 1fr 1fr 1.5fr 2fr 1.5fr 1fr', 
          padding: '16px', 
          borderBottom: '1px solid var(--border)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ width: '16px', height: '16px', border: '1px solid var(--text-muted)', borderRadius: '4px', opacity: 0.5 }}></div>
          </div>
          <div>Name</div>
          <div>Status</div>
          <div>Bot</div>
          <div>From Number</div>
          <div>Progress</div>
          <div>Concurrent Calls</div>
          <div>Created Date</div>
        </div>

        {/* Table Body / Empty State */}
        <div style={{ 
          padding: '60px 20px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.1)'
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '32px' }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
            No bulk call campaigns found.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Try creating a new campaign to get started.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
