import { useState, useEffect } from 'react';

export default function WHHome() {
  const [activeTab, setActiveTab] = useState('whatsapp');
  const [phoneNumber, setPhoneNumber] = useState('—');

  useEffect(() => {
    const workspaceId = localStorage.getItem('workspaceId') ?? '';
    const token = localStorage.getItem('token') ?? '';
    fetch(`/api/v1/workspaces/${workspaceId}/whatsapp/number/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.phoneNumber) setPhoneNumber(data.phoneNumber); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ 
      padding: '24px', 
      maxWidth: '1200px', 
      margin: '0 auto', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      color: '#1e293b'
    }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px', color: 'var(--text-primary, #fff)' }}>
        Hello, User. Welcome to OmniDimension!
      </h1>

      {/* Top Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        {/* Connection Card 1 */}
        <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '24px', display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eafff5', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '20px', border: '1px solid #bbf7d0' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', color: '#1e293b', fontWeight: 500, marginBottom: '4px' }}>Whatsapp Number is connected</div>
            <div style={{ fontSize: '15px', color: '#475569', fontWeight: 600 }}>{phoneNumber}</div>
          </div>
        </div>

        {/* Connection Card 2 */}
        <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '20px', border: '2px solid #e2e8f0' }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
            </div>
            <div style={{ fontSize: '15px', color: '#64748b' }}>Your Business Instagram is not connected</div>
          </div>
          <button style={{ backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Connect Account</button>
        </div>
      </div>

      {/* Banner */}
      <div style={{ backgroundColor: '#fff', borderRadius: '4px', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '56px', height: '56px', backgroundColor: '#99f6e4', borderRadius: '8px', marginRight: '24px', position: 'relative', overflow: 'hidden' }}>
             <div style={{ position: 'absolute', bottom: 0, left: '8px', width: '16px', height: '32px', backgroundColor: '#5eead4', borderRadius: '4px 4px 0 0' }}></div>
             <div style={{ position: 'absolute', bottom: 0, left: '28px', width: '20px', height: '20px', backgroundColor: '#5eead4', borderRadius: '4px 4px 0 0' }}></div>
             <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '32px', height: '32px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '50%' }}></div>
          </div>
          <div>
            <div style={{ fontSize: '15px', color: '#1e293b', fontWeight: 600, marginBottom: '4px' }}>Unleash your potential with one of our Active plans</div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>—</div>
          </div>
        </div>
        <button style={{ backgroundColor: '#fff', border: '1px solid #4ade80', color: '#4ade80', borderRadius: '4px', padding: '8px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Upgrade plan</button>
      </div>

      {/* Tabs Layout Container */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        
        {/* Tabs Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px', gap: '32px' }}>
          <button 
            onClick={() => setActiveTab('whatsapp')}
            style={{ 
              background: 'none', border: 'none', padding: '20px 8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              color: activeTab === 'whatsapp' ? '#064e3b' : '#64748b',
              borderBottom: activeTab === 'whatsapp' ? '2px solid #064e3b' : '2px solid transparent'
            }}
          >Whatsapp</button>
          <button 
            onClick={() => setActiveTab('instagram')}
            style={{ 
              background: 'none', border: 'none', padding: '20px 8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              color: activeTab === 'instagram' ? '#064e3b' : '#64748b',
              borderBottom: activeTab === 'instagram' ? '2px solid #064e3b' : '2px solid transparent'
            }}
          >Instagram</button>
        </div>

        {/* Tab Content */}
        {activeTab === 'whatsapp' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: '1px solid #f1f5f9' }}></div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 300px) minmax(0, 1fr)', backgroundColor: '#f8fafc', padding: '0' }}>
              
              {/* Left Column (Journeys) */}
              <div style={{ padding: '24px', borderRight: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
                <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>journey</span>
                  <span style={{ fontSize: '13px', backgroundColor: '#475569', color: 'white', padding: '6px 16px', borderRadius: '20px', cursor: 'pointer' }}>View more ↑</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No journeys yet</div>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ padding: '24px', display: 'flex', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', gap: '16px', marginBottom: '24px' }}>
                     <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #94a3b8', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: '2px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>i</span>
                     </div>
                     <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.5' }}>
                       Send bulk WhatsApp campaigns to 1000s of customers to re-engage them and drive repeat orders
                     </div>
                  </div>

                  <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '24px', letterSpacing: '0.5px' }}>PRE-REQUISITES</div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '48px', height: '36px', backgroundColor: '#f1f5f9', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        </div>
                        <div style={{ fontSize: '15px', color: '#334155' }}>Add your customers</div>
                      </div>
                      <button style={{ backgroundColor: '#4ade80', color: '#fff', border: 'none', borderRadius: '4px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Add Customers</button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '48px', height: '36px', backgroundColor: '#f1f5f9', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        </div>
                        <div style={{ fontSize: '15px', color: '#334155' }}>Create a template & wait for its approval</div>
                      </div>
                      <button style={{ backgroundColor: '#4ade80', color: '#fff', border: 'none', borderRadius: '4px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Create Template</button>
                    </div>
                  </div>
                </div>

                {/* Phone Mockup */}
                <div style={{ width: '280px', flexShrink: 0, position: 'relative' }}>
                  <div style={{ width: '280px', height: '480px', borderRadius: '32px', border: '8px solid #f1f5f9', backgroundColor: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                     <div style={{ backgroundColor: '#075e54', padding: '12px 16px', display: 'flex', alignItems: 'center', color: '#fff' }}>
                       <div style={{ width: '32px', height: '32px', backgroundColor: '#128c7e', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '12px', marginTop: '20px' }}>
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                       </div>
                       <div style={{ marginTop: '20px' }}>
                         <div style={{ fontSize: '13px', fontWeight: 600 }}>Your Business</div>
                       </div>
                     </div>
                     <div style={{ flex: 1, backgroundColor: '#e5ddd5', padding: '20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <div style={{ fontSize: '13px', color: '#64748b' }}>No messages yet</div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'instagram' && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <p>Instagram features are currently unavailable. Connect your account to get started.</p>
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 100 }}>
        <button style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '32px', padding: '12px 24px', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.4)', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight: 'bold' }}>?</div> Help
        </button>
      </div>
    </div>
  );
}
