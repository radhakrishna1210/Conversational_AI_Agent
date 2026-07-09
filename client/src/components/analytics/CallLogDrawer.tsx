import { memo } from 'react';
import { X, Phone, Clock, Smile, MessageSquare, Zap, BarChart2, Tag } from 'lucide-react';
import type { CallLog, Sentiment } from '../../data/mockCallLogs';
import { StatusBadge } from './StatusBadge';

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

const SENTIMENT_CONFIG: Record<Sentiment, { color: string; emoji: string }> = {
  positive: { color: '#22c55e', emoji: '😊' },
  neutral:  { color: '#f59e0b', emoji: '😐' },
  negative: { color: '#ef4444', emoji: '😟' },
};

interface CallLogDrawerProps {
  log: CallLog | null;
  onClose: () => void;
}

export const CallLogDrawer = memo(function CallLogDrawer({ log, onClose }: CallLogDrawerProps) {
  if (!log) return null;

  const sentiment = SENTIMENT_CONFIG[log.sentiment];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1100,
          animation: 'dr-fadein 0.2s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          maxWidth: '95vw',
          background: '#0a0a0a',
          borderLeft: '1px solid #1e1e1e',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1200,
          animation: 'dr-slidein 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 22px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#080808',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              {log.customerName}
            </div>
            <div style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={11} />
              {log.phone}
              &nbsp;·&nbsp;
              <span style={{ fontFamily: 'monospace' }}>{log.id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#888',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Status + basic info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <StatusBadge status={log.status} />
            <InfoChip icon={<Clock size={12} />} label={fmtDuration(log.durationSec)} />
            <InfoChip icon={<Smile size={12} style={{ color: sentiment.color }} />} label={`${sentiment.emoji} ${log.sentiment}`} color={sentiment.color} />
          </div>

          {/* Metadata grid */}
          <Section title="Call Details">
            <Grid2>
              <MetaRow label="Date" value={new Date(log.timestamp).toLocaleString()} />
              <MetaRow label="Agent" value={log.agent} />
              <MetaRow label="Template" value={log.template.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              <MetaRow label="Outcome" value={log.outcome} />
              <MetaRow label="Intent" value={log.intent} />
              <MetaRow label="Sentiment" value={log.sentiment} color={sentiment.color} />
            </Grid2>
          </Section>

          {/* Summary */}
          <Section title="Call Summary" icon={<MessageSquare size={13} />}>
            <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7, margin: 0 }}>{log.summary}</p>
          </Section>

          {/* Transcript */}
          <Section title="Conversation Transcript" icon={<Zap size={13} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {log.transcript.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Timestamp */}
                  <span style={{
                    fontSize: 10,
                    color: '#444',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                    paddingTop: 3,
                    width: 32,
                  }}>{line.ts}</span>
                  {/* Bubble */}
                  <div style={{
                    flex: 1,
                    background: line.speaker === 'agent' ? '#0f1a1f' : '#1a1a1a',
                    border: `1px solid ${line.speaker === 'agent' ? '#0d3040' : '#2a2a2a'}`,
                    borderRadius: 10,
                    padding: '9px 13px',
                  }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: line.speaker === 'agent' ? '#00bcd4' : '#888',
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}>
                      {line.speaker === 'agent' ? '🤖 Agent' : '👤 Customer'}
                    </div>
                    <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.55 }}>{line.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Analysis */}
          <Section title="AI Analysis" icon={<BarChart2 size={13} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <AnalysisRow label="Detected Intent" value={log.intent} icon={<Tag size={12} />} />
              <AnalysisRow label="Sentiment" value={`${sentiment.emoji} ${log.sentiment.charAt(0).toUpperCase() + log.sentiment.slice(1)}`} color={sentiment.color} />
              <AnalysisRow label="Template Used" value={log.template.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              <AnalysisRow label="Agent" value={log.agent} />
            </div>
          </Section>
        </div>
      </div>

      <style>{`
        @keyframes dr-fadein  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dr-slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
});

/* ── Local helpers ──────────────────────────────────────────────── */
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#555', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}

function MetaRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '10px 13px' }}>
      <div style={{ fontSize: 10, color: '#444', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: color ?? '#ccc', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function InfoChip({ label, icon, color }: { label: string; icon?: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 20,
      background: '#111', border: '1px solid #222',
      fontSize: 12, color: color ?? '#aaa', fontWeight: 600,
    }}>
      {icon}{label}
    </span>
  );
}

function AnalysisRow({ label, value, icon, color }: { label: string; value: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', background: '#111', border: '1px solid #1e1e1e', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#555' }}>
        {icon}
        {label}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? '#ccc' }}>{value}</span>
    </div>
  );
}
