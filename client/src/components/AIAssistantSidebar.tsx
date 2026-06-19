import React from 'react';

interface AIAssistantSidebarProps {
  onClose: () => void;
  input: string;
  setInput: (value: string) => void;
  response: string;
  isLoading: boolean;
  onSubmit: () => void;
}

const SUGGESTIONS = [
  "Suggest a welcome message for a technical support agent.",
  "Give me ideas for qualification questions to collect leads.",
  "How can I make my agent handle billing inquiries professionally?",
  "Recommend business rules for transfer to a live human agent."
];

export default function AIAssistantSidebar({
  onClose,
  input,
  setInput,
  response,
  isLoading,
  onSubmit
}: AIAssistantSidebarProps) {

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  // Helper to format AI response text with basic styling
  const formatResponse = (text: string) => {
    if (!text) return null;
    
    return text.split('\n').map((line, index) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith('###')) {
        return (
          <h4 key={index} style={{ color: '#00bcd4', fontSize: '14px', fontWeight: '600', marginTop: '16px', marginBottom: '8px' }}>
            {trimmed.replace(/^###\s*/, '')}
          </h4>
        );
      }
      if (trimmed.startsWith('##')) {
        return (
          <h3 key={index} style={{ color: '#00bcd4', fontSize: '15px', fontWeight: '700', marginTop: '20px', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
            {trimmed.replace(/^##\s*/, '')}
          </h3>
        );
      }
      if (trimmed.startsWith('#')) {
        return (
          <h2 key={index} style={{ color: '#00bcd4', fontSize: '16px', fontWeight: '800', marginTop: '24px', marginBottom: '12px' }}>
            {trimmed.replace(/^#\s*/, '')}
          </h2>
        );
      }

      // Bullet points
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return (
          <div key={index} style={{ display: 'flex', gap: '8px', fontSize: '13px', lineHeight: '1.6', color: '#e0e0e0', margin: '6px 0 6px 12px' }}>
            <span style={{ color: '#ff9800' }}>•</span>
            <span>{trimmed.replace(/^[-*]\s*/, '')}</span>
          </div>
        );
      }

      // Code blocks (inline simulation or simple pre)
      if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
        return (
          <pre key={index} style={{ background: '#0a0a0a', padding: '10px', borderRadius: '6px', border: '1px solid #222', fontSize: '12px', color: '#ff9800', overflowX: 'auto', margin: '8px 0', fontFamily: 'monospace' }}>
            {trimmed.replace(/^`|`$/g, '')}
          </pre>
        );
      }

      // Standard line
      return trimmed === '' ? (
        <div key={index} style={{ height: '10px' }} />
      ) : (
        <p key={index} style={{ margin: '0 0 10px 0', fontSize: '13px', lineHeight: '1.6', color: '#cccccc' }}>
          {line}
        </p>
      );
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '420px',
      maxWidth: '100%',
      background: 'rgba(21, 21, 21, 0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 999,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#fff',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15, 15, 15, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>✨</span>
          <span style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '0.5px' }}>AI Co-Pilot</span>
        </div>
        <button 
          onClick={onClose} 
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'background 0.2s, color 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = '#999';
          }}
        >
          ✕
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {!response && !isLoading ? (
          // Initial Suggestions / Welcome
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
            <div style={{
              background: 'rgba(255, 152, 0, 0.08)',
              border: '1px solid rgba(255, 152, 0, 0.15)',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.5',
              color: '#ffa726'
            }}>
              👋 Hello! I am your AI assistant. Ask me questions or request improvements for your voice agent configuration.
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '12px' }}>
                Quick Suggestions
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(s)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      textAlign: 'left',
                      color: '#ddd',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.border = '1px solid rgba(0, 188, 212, 0.3)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.color = '#ddd';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Response Viewer
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {response && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                borderRadius: '8px',
                padding: '16px 20px',
                marginBottom: '16px'
              }}>
                {formatResponse(response)}
              </div>
            )}

            {isLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                background: 'rgba(0, 188, 212, 0.05)',
                border: '1px solid rgba(0, 188, 212, 0.1)',
                borderRadius: '8px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}>
                <div style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(0, 188, 212, 0.2)',
                  borderTopColor: '#00bcd4',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '13px', color: '#00bcd4', fontWeight: '500' }}>AI is thinking...</span>
                <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Form Input */}
      <div style={{
        padding: '20px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 15, 15, 0.6)'
      }}>
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your question or request here..."
            disabled={isLoading}
            style={{
              width: '100%',
              minHeight: '80px',
              maxHeight: '180px',
              background: '#0a0a0a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              color: '#fff',
              fontSize: '13px',
              lineHeight: '1.5',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
              fontFamily: 'inherit'
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#00bcd4'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              padding: '12px',
              background: '#ff9800',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              opacity: (isLoading || !input.trim()) ? 0.5 : 1
            }}
          >
            {isLoading ? 'Thinking...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
