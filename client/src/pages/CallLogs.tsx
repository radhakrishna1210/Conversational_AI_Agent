import DashboardLayout from '../components/DashboardLayout';

export default function CallLogs() {
  return (
    <DashboardLayout>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Call Logs</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          View and analyze your call history
        </p>
      </div>

      {/* Filters Section */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        background: 'rgba(255,255,255,0.01)',
        padding: '24px',
        marginBottom: '24px'
      }}>
        {/* Filter Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: '0 0 4px 0', color: 'white' }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
              Filters
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              Filter call logs by bot, date range, status, and more
            </p>
          </div>
          <button style={{
            background: 'var(--teal)',
            color: 'var(--bg-primary)',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer'
          }}>
            Hide
          </button>
        </div>

        {/* Filter Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          
          {/* Row 1 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Bulk Calls</label>
            <select className="form-select" style={{ width: '100%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}>
              <option>Select bulk calls</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Call Status</label>
            <select className="form-select" style={{ width: '100%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}>
              <option>All Statuses</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Call Direction</label>
            <select className="form-select" style={{ width: '100%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}>
              <option>All Directions</option>
            </select>
          </div>

          {/* Row 2 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Channel Type</label>
            <select className="form-select" style={{ width: '100%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}>
              <option>All Channels</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Call Transferred</label>
            <select className="form-select" style={{ width: '100%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}>
              <option>All</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Call Duration (seconds)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" className="form-input" placeholder="Min" style={{ width: '50%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }} />
              <input type="text" className="form-input" placeholder="Max" style={{ width: '50%', padding: '10px 14px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          {/* Row 3 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Start Date</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }}>📅</span>
              <input type="text" className="form-input" placeholder="Pick a date" style={{ width: '100%', padding: '10px 14px 10px 36px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>End Date</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }}>📅</span>
              <input type="text" className="form-input" placeholder="Pick a date" style={{ width: '100%', padding: '10px 14px 10px 36px', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

        </div>
      </div>

      {/* Table Controls */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
        <select className="form-select" style={{ padding: '6px 32px 6px 16px', fontSize: '13px', background: 'transparent', width: 'auto' }}>
          <option>25</option>
          <option>50</option>
          <option>100</option>
        </select>
        <button style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          ⚙️ Columns
        </button>
        <button style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          📥 CSV
        </button>
      </div>

      {/* Table Area */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
        
        {/* Table Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1.2fr 1.2fr 1.2fr 1.2fr 1fr 1fr 1fr 1fr 1fr', 
          padding: '16px', 
          background: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          alignItems: 'center'
        }}>
          <div>Call Logs</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Call Date <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Bot Name <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>From Number <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>To Number <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Duration <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Call Type <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Status <span>⇅</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Cost <span>⇅</span></div>
          <div>Recording</div>
        </div>

        {/* Empty State */}
        <div style={{ 
          padding: '48px', 
          textAlign: 'center', 
          color: 'var(--text-secondary)', 
          fontSize: '13px',
          background: 'rgba(0,0,0,0.1)'
        }}>
          No records found
        </div>
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Showing 0-0 of 0 records
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>&lt; Previous</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Page 
            <input type="text" value="1" readOnly style={{ 
              width: '32px', 
              padding: '4px', 
              textAlign: 'center', 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid var(--border)', 
              borderRadius: '4px',
              color: 'white'
            }} /> 
            of 0
          </div>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Next &gt;</button>
        </div>
      </div>

    </DashboardLayout>
  );
}
