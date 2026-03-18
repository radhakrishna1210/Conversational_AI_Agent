export default function Analytics() {
  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Analytics</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          View and analyze your call and chat performance metrics
        </p>
      </div>

      {/* Main Filter Bar */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        background: 'rgba(255,255,255,0.02)',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={{
            background: 'rgba(0, 212, 200, 0.05)',
            border: '1px solid rgba(0, 212, 200, 0.3)',
            color: 'var(--teal)',
            padding: '6px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Last 7 days
          </button>
          <button style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: 'white',
            padding: '6px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Last 30 days
          </button>
          <button style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: 'white',
            padding: '6px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Last 90 days
          </button>
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }}></div>
          
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }}>📅</span>
            <input 
              type="text" 
              value="Mar 11, 2026 - Mar 18, 2026" 
              readOnly
              className="form-input" 
              style={{ padding: '6px 16px 6px 36px', fontSize: '13px', background: 'transparent', border: '1px solid var(--border)', width: '220px', cursor: 'pointer' }} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Select Assistant</span>
          <select className="form-select" style={{ padding: '6px 32px 6px 12px', fontSize: '13px', background: 'transparent' }}>
            <option>All Assistants</option>
          </select>
        </div>
      </div>

      {/* Main Mode Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
        <button style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '8px 24px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          Phone Call Analytics
        </button>
        <button style={{
          background: 'transparent',
          border: '1px solid transparent',
          color: 'var(--text-secondary)',
          padding: '8px 24px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          Website Chatbot Analytics
        </button>
      </div>

      {/* Four Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        
        <div style={{ borderTop: '2px solid var(--teal)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '8px', padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Total Calls Count</span>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>📞</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>0</div>
        </div>

        <div style={{ borderTop: '2px solid var(--teal)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '8px', padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Total call duration</span>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🕒</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>0 min</div>
        </div>

        <div style={{ borderTop: '2px solid var(--teal)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '8px', padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Avg. Duration</span>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>🕒</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>0 min</div>
        </div>

        <div style={{ borderTop: '2px solid var(--teal)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderRadius: '8px', padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>Total Assistants</span>
            <span style={{ color: 'var(--teal)', fontSize: '16px' }}>👥</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>0</div>
        </div>

      </div>

      {/* Chart Metric Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
        <button style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          Call Volume
        </button>
        <button style={{
          background: 'transparent',
          border: '1px solid transparent',
          color: 'var(--text-secondary)',
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          Call Duration
        </button>
      </div>

      {/* Chart Box */}
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        background: 'rgba(255,255,255,0.01)',
        padding: '24px',
        marginBottom: '48px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>Call Volume Over Time</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '32px' }}>Number of calls per day in the selected period</p>

        {/* CSS Chart Representation */}
        <div style={{ position: 'relative', height: '300px', width: '100%' }}>
          
          {/* Y-Axis labels */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: '30px', width: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--text-muted)', fontSize: '12px', paddingRight: '10px' }}>
            <span>4</span>
            <span>3</span>
            <span>2</span>
            <span>1</span>
            <span>0</span>
          </div>

          {/* Grid lines (horizontal) */}
          <div style={{ position: 'absolute', left: '30px', right: 0, top: '6px', height: '1px', borderTop: '1px dashed var(--border)' }}></div>
          <div style={{ position: 'absolute', left: '30px', right: 0, top: '25%', height: '1px', borderTop: '1px dashed var(--border)' }}></div>
          <div style={{ position: 'absolute', left: '30px', right: 0, top: '50%', height: '1px', borderTop: '1px dashed var(--border)' }}></div>
          <div style={{ position: 'absolute', left: '30px', right: 0, top: '75%', height: '1px', borderTop: '1px dashed var(--border)' }}></div>
          <div style={{ position: 'absolute', left: '30px', right: 0, bottom: '30px', height: '1px', borderBottom: '1px solid var(--text-muted)' }}></div>

          {/* Grid lines (vertical)  */}
          <div style={{ position: 'absolute', left: '30px', right: 0, top: '6px', bottom: '30px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
            <div style={{ borderLeft: '1px dashed var(--border)', height: '100%' }}></div>
          </div>

          {/* X-Axis labels */}
          <div style={{ position: 'absolute', left: '30px', right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px' }}>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 11</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 12</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 13</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 14</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 15</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 16</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 17</span>
            <span style={{ transform: 'translateX(-50%)' }}>Mar 18</span>
          </div>

          {/* Data Line (teal base line since it's all 0) */}
          <div style={{ position: 'absolute', left: '30px', right: 0, bottom: '29px', height: '2px', background: 'var(--teal)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg-primary)', border: '2px solid var(--teal)', transform: 'translate(-50%, 0)' }}></div>
          </div>

        </div>

        {/* Key / Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
             <span style={{ width: '12px', height: '2px', background: 'var(--teal)', position: 'relative', display: 'inline-block' }}>
               <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '4px', height: '4px', background: 'var(--bg-primary)', border: '1px solid var(--teal)', borderRadius: '50%' }}></span>
             </span>
             <span style={{ color: 'var(--teal)', fontSize: '12px', fontWeight: 600 }}>calls</span>
          </div>
        </div>

      </div>

    </>
  );
}
