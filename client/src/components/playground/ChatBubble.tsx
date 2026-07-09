import { memo } from 'react';
import type { ChatMessage } from './types';

interface ChatBubbleProps {
  message: ChatMessage;
  agentInitial: string;
  accentColor: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ChatBubble = memo(function ChatBubble({
  message,
  agentInitial,
  accentColor,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 10,
        animation: 'pg-fadein 0.25s ease',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: isUser ? '#2a2a2a' : `${accentColor}22`,
          border: `1.5px solid ${isUser ? '#333' : accentColor + '55'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: isUser ? 13 : 14,
          fontWeight: isUser ? 700 : 400,
          color: isUser ? '#ccc' : accentColor,
        }}
      >
        {isUser ? 'U' : '🤖'}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
        {/* Label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>
            {isUser ? 'You' : agentInitial}
          </span>
          <span style={{ fontSize: 10, color: '#444' }}>{formatTime(message.timestamp)}</span>
        </div>

        {/* Message text */}
        <div
          style={{
            padding: '10px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            background: isUser
              ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
              : '#1a1a1a',
            color: isUser ? '#000' : '#e8e8e8',
            fontSize: 14,
            lineHeight: 1.6,
            border: isUser ? 'none' : '1px solid #2a2a2a',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            boxShadow: isUser ? `0 2px 12px ${accentColor}30` : 'none',
          }}
        >
          {message.content}
        </div>
      </div>

      <style>{`
        @keyframes pg-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
