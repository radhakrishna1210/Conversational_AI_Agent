import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface KevinChatWidgetProps {
  open: boolean;
  onClose: () => void;
}

export default function KevinChatWidget({ open, onClose }: KevinChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "👋 Hi! I'm Kevin, your OmniDimension AI assistant. Ask me anything about setting up voice agents, integrations, pricing, or how the platform works!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when widget opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          systemPrompt:
            "You are Kevin, a friendly and knowledgeable AI assistant for OmniDimension — a Conversational Voice AI platform. Help users with questions about voice agents, integrations (N8N, Genesys, Twilio, WhatsApp), pricing, call flows, speech-to-text, text-to-speech, language support, and general platform features. Be concise, warm, and helpful.",
        }),
      });

      const data = await res.json();
      const replyText = data.message || data.reply || "I'm having a little trouble right now. Please try again in a moment.";

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString() + '_k',
          role: 'assistant',
          text: replyText,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString() + '_err',
          role: 'assistant',
          text: "Sorry, I couldn't connect right now. Please check your connection and try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop (click outside to close) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 998,
        }}
      />

      {/* Chat panel */}
      <div
        style={{
          position: 'fixed',
          bottom: '88px',
          right: '24px',
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
          height: '480px',
          maxHeight: 'calc(100vh - 120px)',
          background: 'rgba(15, 15, 20, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999,
          overflow: 'hidden',
          animation: 'kevinSlideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <style>{`
          @keyframes kevinSlideUp {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
          @keyframes kevinDotBounce {
            0%, 80%, 100% { transform: translateY(0); }
            40%            { transform: translateY(-5px); }
          }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Kevin avatar */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--teal, #00bcd4), #0097a7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 6h3.5C14.5 6 17 8.5 17 11s-2.5 5-5.5 5H8V6z" fill="#000" fillOpacity="0.8"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                Kevin
              </div>
              <div style={{ fontSize: '11px', color: '#00bcd4', lineHeight: 1.2 }}>
                OmniDimension AI
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '4px',
              borderRadius: '6px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = '#666')}
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  padding: '10px 13px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                  background:
                    msg.role === 'user'
                      ? 'var(--teal, #00bcd4)'
                      : 'rgba(255,255,255,0.05)',
                  color: msg.role === 'user' ? '#000' : '#e0e0e0',
                  border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  fontSize: '13px',
                  lineHeight: '1.55',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '4px 14px 14px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex',
                  gap: '5px',
                  alignItems: 'center',
                }}
              >
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#00bcd4',
                      display: 'inline-block',
                      animation: `kevinDotBounce 1.2s ${i * 0.2}s infinite ease-in-out`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '12px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Kevin anything…"
            disabled={loading}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              padding: '9px 13px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.2s',
              fontFamily: 'inherit',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#00bcd4')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              padding: '9px 14px',
              background: 'var(--teal, #00bcd4)',
              color: '#000',
              border: 'none',
              borderRadius: '10px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              opacity: loading || !input.trim() ? 0.5 : 1,
              transition: 'opacity 0.2s',
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </form>
      </div>
    </>
  );
}
