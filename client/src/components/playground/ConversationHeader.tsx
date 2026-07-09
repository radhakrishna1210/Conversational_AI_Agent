import { memo } from 'react';
import { Trash2, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { PlaygroundConfig } from './types';

interface ConversationHeaderProps {
  config: PlaygroundConfig;
  onClear: () => void;
  onRestart: () => void;
  onCopy: () => void;
  messageCount: number;
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '6px 14px',
        background: '#111',
        border: '1px solid #222',
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: 10, color: '#555', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: '#ccc', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
        {value || '—'}
      </span>
    </div>
  );
}

export const ConversationHeader = memo(function ConversationHeader({
  config,
  onClear,
  onRestart,
  onCopy,
  messageCount,
}: ConversationHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const templateLabel = config.templateId
    ? config.templateId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'No template';

  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Row 1: Agent info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {/* Agent avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `${config.accentColor}20`,
              border: `1.5px solid ${config.accentColor}50`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
              {config.agentName || 'AI Agent'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#22c55e',
                  background: '#22c55e15',
                  border: '1px solid #22c55e30',
                  borderRadius: 20,
                  padding: '2px 8px',
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
                Live
              </span>
              <span style={{ fontSize: 11, color: '#444' }}>{messageCount} message{messageCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ActionButton icon={<RefreshCw size={14} />} label="Restart" onClick={onRestart} title="Restart conversation" />
          <ActionButton icon={<Trash2 size={14} />} label="Clear" onClick={onClear} title="Clear all messages" danger />
          <ActionButton
            icon={copied ? <CheckCircle2 size={14} color="#22c55e" /> : <Copy size={14} />}
            label={copied ? 'Copied!' : 'Copy'}
            onClick={handleCopy}
            title="Copy conversation transcript"
            success={copied}
          />
        </div>
      </div>

      {/* Row 2: Info pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        <InfoPill label="Template" value={templateLabel} />
        <InfoPill label="Voice" value={config.voice} />
        <InfoPill label="Language" value={config.language} />
      </div>

      <style>{`
        @keyframes pg-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
});

/* ── Local helper ──────────────────────────────────────────────────────── */
function ActionButton({
  icon,
  label,
  onClick,
  title,
  danger,
  success,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  title: string;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        background: success ? '#22c55e15' : '#111',
        border: `1px solid ${danger ? '#333' : success ? '#22c55e30' : '#222'}`,
        color: danger ? '#888' : success ? '#22c55e' : '#aaa',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
        fontFamily: 'var(--font-main, inherit)',
      }}
      onMouseOver={(e) => {
        if (!success) {
          e.currentTarget.style.background = danger ? '#1f0a0a' : '#1a1a1a';
          e.currentTarget.style.color = danger ? '#f87171' : '#fff';
        }
      }}
      onMouseOut={(e) => {
        if (!success) {
          e.currentTarget.style.background = '#111';
          e.currentTarget.style.color = danger ? '#888' : '#aaa';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}
