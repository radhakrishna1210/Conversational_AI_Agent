import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { PromptSuggestions } from './PromptSuggestions';
import { ConversationHeader } from './ConversationHeader';
import { ChatInput } from './ChatInput';
import type { ChatMessage, PlaygroundConfig } from './types';
import { getMockReply, getQuickPrompts } from '../../data/mockResponses';

interface AgentPlaygroundProps {
  config: PlaygroundConfig;
}

function makeid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const AgentPlayground = memo(function AgentPlayground({ config }: AgentPlaygroundProps) {
  const { agentName, templateId, voice, language, welcomeMessage, accentColor } = config;

  const initialMessage: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: welcomeMessage || `Hello! I'm ${agentName || 'your AI agent'}. How can I help you today?`,
    timestamp: new Date(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationCountRef = useRef(0);

  /* Auto-scroll to latest message */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const quickPrompts = getQuickPrompts(templateId);

  /* ── Send a user message ──────────────────────────────────────────── */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      id: makeid(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    try {
      const reply = await getMockReply(trimmed, templateId, conversationCountRef.current++);
      const aiMsg: ChatMessage = {
        id: makeid(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, templateId]);

  /* ── Quick prompt click ─────────────────────────────────────────── */
  const handlePromptSelect = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  /* ── Conversation controls ──────────────────────────────────────── */
  const handleClear = useCallback(() => {
    setMessages([{ ...initialMessage, id: makeid(), timestamp: new Date() }]);
    conversationCountRef.current = 0;
  }, [welcomeMessage, agentName]);

  const handleRestart = useCallback(() => {
    setMessages([{ ...initialMessage, id: makeid(), timestamp: new Date() }]);
    conversationCountRef.current = 0;
    setInputValue('');
  }, [welcomeMessage, agentName]);

  const handleCopy = useCallback(() => {
    const text = messages
      .map((m) => `[${m.role === 'user' ? 'User' : 'Agent'}] ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
  }, [messages]);

  /* ── Responsive detection ──────────────────────────────────────── */
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 800;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        height: '100%',
        minHeight: 560,
        background: '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* ── Left sidebar: agent card ─────────────────────────────── */}
      {!isNarrow && (
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid #1a1a1a',
            padding: '24px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            background: '#080808',
          }}
        >
          {/* Agent avatar */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 18,
                background: `${accentColor}18`,
                border: `2px solid ${accentColor}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                margin: '0 auto 12px',
              }}
            >
              🤖
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {agentName || 'AI Agent'}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: '#22c55e',
                background: '#22c55e12',
                border: '1px solid #22c55e28',
                borderRadius: 20,
                padding: '3px 10px',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#22c55e',
                  animation: 'pg-pulse 2s ease infinite',
                  display: 'inline-block',
                }}
              />
              Ready
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #1a1a1a' }} />

          {/* Info rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Template', value: templateId ? templateId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'None' },
              { label: 'Voice', value: voice || 'Default' },
              { label: 'Language', value: language || 'English' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: '#bbb', fontWeight: 500, wordBreak: 'break-word' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #1a1a1a' }} />

          {/* Stats */}
          <div>
            <div style={{ fontSize: 10, color: '#444', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Session
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#777', marginBottom: 8 }}>
              <span>Messages</span>
              <span style={{ color: accentColor, fontWeight: 600 }}>{messages.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#777' }}>
              <span>Turns</span>
              <span style={{ color: accentColor, fontWeight: 600 }}>{conversationCountRef.current}</span>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main chat panel ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <ConversationHeader
          config={config}
          onClear={handleClear}
          onRestart={handleRestart}
          onCopy={handleCopy}
          messageCount={messages.length}
        />

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            background: '#0a0a0a',
            scrollbarWidth: 'thin',
            scrollbarColor: '#222 transparent',
          }}
        >
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              agentInitial={agentName || 'AI'}
              accentColor={accentColor}
            />
          ))}

          {isTyping && <TypingIndicator accentColor={accentColor} />}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #141414' }} />

        {/* Quick prompts */}
        <div style={{ background: '#080808' }}>
          <PromptSuggestions
            prompts={quickPrompts}
            onSelect={handlePromptSelect}
            accentColor={accentColor}
          />
        </div>

        {/* Input */}
        <div style={{ background: '#080808' }}>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={() => sendMessage(inputValue)}
            disabled={isTyping}
            accentColor={accentColor}
          />
        </div>
      </div>

      <style>{`
        @keyframes pg-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
});
