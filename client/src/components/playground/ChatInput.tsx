import { useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  accentColor: string;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  accentColor,
  placeholder = 'Type a message… (Enter to send, Shift+Enter for new line)',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [value]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        padding: '12px 16px 14px',
        background: '#0a0a0a',
        borderTop: '1px solid #1a1a1a',
      }}
    >
      <div
        style={{
          flex: 1,
          background: '#111',
          border: `1.5px solid ${value.length > 0 ? accentColor + '60' : '#222'}`,
          borderRadius: 14,
          transition: 'border-color 0.2s',
          overflow: 'hidden',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e8e8e8',
            fontSize: 14,
            lineHeight: 1.6,
            padding: '10px 14px',
            resize: 'none',
            fontFamily: 'var(--font-main, inherit)',
            boxSizing: 'border-box',
            maxHeight: 140,
            overflowY: 'auto',
          }}
        />
      </div>

      <button
        onClick={onSend}
        disabled={!canSend}
        title="Send message"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: canSend ? accentColor : '#1a1a1a',
          border: 'none',
          color: canSend ? '#000' : '#444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canSend ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s, transform 0.1s',
          flexShrink: 0,
          boxShadow: canSend ? `0 4px 16px ${accentColor}40` : 'none',
        }}
        onMouseOver={(e) => { if (canSend) e.currentTarget.style.transform = 'scale(1.07)'; }}
        onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <Send size={18} />
      </button>
    </div>
  );
}
