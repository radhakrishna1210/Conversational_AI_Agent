import React, { useState, useRef, useEffect } from 'react';

import { getAuth } from '@/lib/authStorage';
import { whapi } from '@/lib/whapi';
interface Message {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  language?: string;
  timestamp: Date;
}

interface ChatProps {
  agentId: string;
  selectedLanguages: string[];
  welcomeMessage?: string;
}

export default function ChatComponent({ agentId, selectedLanguages, welcomeMessage }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Recent Calls history: this chat session's server-side log entry
  const sessionLogIdRef = useRef<string | null>(null);
  const latestTranscriptRef = useRef<{ role: string; content: string }[]>([]);

  const storeSession = async (msgs: Message[]) => {
    const transcript = msgs
      .filter(m => !m.text.startsWith('❌ Error:'))
      .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.text }));
    latestTranscriptRef.current = transcript;
    try {
      if (!sessionLogIdRef.current) {
        const res = await whapi.post<{ call?: { id: string } }>(`/agents/${agentId}/calls`, {
          type: 'CHAT', transcript, status: 'IN_PROGRESS',
        });
        sessionLogIdRef.current = res?.call?.id ?? null;
      } else {
        await whapi.patch(`/agents/${agentId}/calls/${sessionLogIdRef.current}`, { transcript });
      }
    } catch (e) {
      console.error('Failed to store chat session in call history', e);
    }
  };

  // Leaving the Chat Test tab is the end of this conversation. Finalizing the
  // stored log triggers variable extraction against the complete transcript.
  useEffect(() => () => {
    const callId = sessionLogIdRef.current;
    if (!callId) return;
    whapi.patch(`/agents/${agentId}/calls/${callId}`, {
      transcript: latestTranscriptRef.current,
      status: 'COMPLETED',
      ended: true,
    }).catch((e) => console.error('Failed to finalize chat session', e));
  }, [agentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add welcome message on mount. Prefer the server-rendered version, where
  // placeholders like [Your Company Name] are resolved from the knowledge
  // base instead of shown literally.
  useEffect(() => {
    if (!welcomeMessage || messages.length !== 0) return;
    let cancelled = false;
    const seed = (text: string) => {
      if (cancelled) return;
      setMessages(prev => (prev.length === 0 ? [{
        id: 'welcome',
        type: 'assistant' as const,
        text,
        timestamp: new Date(),
      }] : prev));
    };
    (async () => {
      try {
        const { token, workspaceId } = getAuth();
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/welcome`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = res.ok ? await res.json() : null;
        seed(data?.welcome || welcomeMessage);
      } catch {
        seed(welcomeMessage);
      }
    })();
    return () => { cancelled = true; };
  }, [welcomeMessage]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = inputValue.trim();
    if (!trimmedInput) return;

    // Validate languages are selected
    if (!selectedLanguages || selectedLanguages.length === 0) {
      setError('Please select at least one language');
      return;
    }

    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: trimmedInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    setError('');

    try {
      // Shared agent runtime endpoint — the same server-side "brain"
      // (conversational flow + knowledge base grounding) the Web Call uses.
      // Full history is sent so the conversation is multi-turn and stateful.
      const { token, workspaceId } = getAuth();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const history = [...messages, userMessage]
        .filter(m => !m.text.startsWith('❌ Error:'))
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.text,
        }));

      const response = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/converse`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        let errorData;
        const text = await response.text();
        try {
          errorData = JSON.parse(text);
        } catch (e) {
          throw new Error(`HTTP ${response.status}: ${text || 'Empty response'}`);
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText || 'Empty response'}`);
      }

      // Add assistant message to chat
      const assistantMessage: Message = {
        id: Date.now().toString() + '_ai',
        type: 'assistant',
        text: data.reply,
        language: data.detectedLanguage,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      // Persist the session after every exchange so the Recent Calls tab
      // always has the full transcript, even if the user just navigates away.
      storeSession([...messages, userMessage, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);

      // Add error message to chat
      const errorMsg: Message = {
        id: Date.now().toString() + '_error',
        type: 'assistant',
        text: `❌ Error: ${errorMessage}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f0f0f',
        borderRadius: '8px',
        border: '1px solid #333',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          background: '#1a1a1a',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Chat Assistant
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#999' }}>
            Languages: {selectedLanguages.join(', ')}
          </p>
        </div>
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
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#999',
              paddingTop: '40px',
              fontSize: '13px',
            }}
          >
            No messages yet. Start a conversation!
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '70%',
                padding: '10px 14px',
                borderRadius: '8px',
                background:
                  msg.type === 'user'
                    ? '#00bcd4'
                    : msg.text.includes('Error')
                      ? '#f44336'
                      : '#1a1a1a',
                color: msg.type === 'user' ? '#000' : '#fff',
                border: msg.type === 'assistant' ? '1px solid #333' : 'none',
                fontSize: '13px',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.text}
              {msg.language && msg.type === 'assistant' && (
                <div
                  style={{
                    fontSize: '10px',
                    color: '#999',
                    marginTop: '6px',
                    fontStyle: 'italic',
                  }}
                >
                  Detected: {msg.language}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#1a1a1a',
                color: '#999',
                border: '1px solid #333',
                fontSize: '13px',
              }}
            >
              Generating response...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: '#f44336',
            color: '#fff',
            fontSize: '11px',
            borderTop: '1px solid #333',
          }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '12px',
          background: '#1a1a1a',
          borderTop: '1px solid #333',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message in any language..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#0f0f0f',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            outline: 'none',
            opacity: loading ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim() || selectedLanguages.length === 0}
          style={{
            padding: '8px 16px',
            background: '#00bcd4',
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '12px',
            opacity: loading || !inputValue.trim() ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
