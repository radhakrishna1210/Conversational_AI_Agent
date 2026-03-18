const integrationsList = [
  {
    name: 'Cal.com',
    icon: '📅', // Placeholder icon
    type: 'During Call',
    description: 'Sync your Cal.com calendar to allow voice assistants to schedule meetings on your behalf.'
  },
  {
    name: 'Calendly',
    icon: '🔵', // Placeholder icon for Calendly
    type: 'During Call',
    description: 'Connect your Calendly account to check availability and schedule appointments through your voice assistants.'
  },
  {
    name: 'Custom API',
    icon: '⚙️', // Placeholder icon for API
    type: 'During Call',
    description: "Connect to any custom API endpoint to extend your assistant's capabilities with external data and services."
  },
  {
    name: 'Salesforce',
    icon: '☁️', // Placeholder icon for Salesforce
    type: 'Post Call',
    description: 'Connect your Salesforce CRM to access customer data, manage leads, and update records through your voice assistants.'
  },
  {
    name: 'Google Calendar',
    icon: '📆', // Placeholder icon for GCal
    type: 'During Call',
    description: 'Connect your Google Calendar to check availability and schedule appointments through your voice assistants.'
  },
  {
    name: 'Google Sheets',
    icon: '📊', // Placeholder icon for Sheets
    type: 'Post Call',
    description: 'Connect your Google Sheets to read, write, and manage spreadsheet data through your voice assistants.'
  },
  {
    name: 'Google Sheets',
    icon: '📊', // Placeholder icon for Sheets (Duplicate from screenshot)
    type: 'During Call',
    description: 'Connect your Google Sheets to read, write, and manage spreadsheet data during calls.'
  },
  {
    name: 'Slack',
    icon: '💬', // Placeholder icon for Slack
    type: 'Post Call',
    description: 'Connect your Slack workspace to receive notifications and updates about your voice assistants.'
  },
  {
    name: 'HubSpot',
    icon: '🟧', // Placeholder icon for HubSpot
    type: 'Post Call',
    description: 'Connect your HubSpot platform to enable voice assistants to manage contacts, automate marketing campaigns, and handle customer service tasks.'
  },
  {
    name: 'Genesys',
    icon: '🔴', // Placeholder icon for Genesys
    type: 'Post Call',
    description: 'Connect your Genesys Cloud contact center to enhance customer experience with AI-powered routing, real-time analytics, and seamless voice AI assistant integration.'
  },
  {
    name: 'WhatsApp Cloud',
    icon: '🟢', // Placeholder icon for WhatsApp
    type: 'During Call',
    description: 'Send WhatsApp messages during calls using Meta Cloud API templates via your connected Cloud WhatsApp number.'
  }
];

export default function Integrations() {
  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>Integrations</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Connect your OmniDimension account with other services to enhance your workflow.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
        <button 
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.05)',
            color: 'white',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          All Integrations
        </button>
        <button 
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Connected
        </button>
      </div>

      {/* Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
        gap: '20px' 
      }}>
        {integrationsList.map((integration, idx) => (
          <div key={idx} style={{
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Card Header & Body */}
            <div style={{ padding: '24px', flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '24px' }}>{integration.icon}</div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'white' }}>{integration.name}</h3>
                </div>
                
                {/* Badge */}
                {integration.type === 'During Call' ? (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(16, 185, 129, 0.05)'
                  }}>
                    {integration.type}
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                  </span>
                ) : (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#3b82f6',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.05)'
                  }}>
                    {integration.type}
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
                  </span>
                )}
              </div>
              
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                {integration.description}
              </p>
            </div>
            
            {/* Card Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
              <button style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Connect
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
