import { memo } from 'react';
import type { CallStatus } from '../../data/mockCallLogs';

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; bg: string; dot: string }> = {
  completed:   { label: 'Completed',   color: '#22c55e', bg: '#22c55e12', dot: '#22c55e' },
  missed:      { label: 'Missed',      color: '#f59e0b', bg: '#f59e0b12', dot: '#f59e0b' },
  transferred: { label: 'Transferred', color: '#3b82f6', bg: '#3b82f612', dot: '#3b82f6' },
  failed:      { label: 'Failed',      color: '#ef4444', bg: '#ef444412', dot: '#ef4444' },
  voicemail:   { label: 'Voicemail',   color: '#a855f7', bg: '#a855f712', dot: '#a855f7' },
};

interface StatusBadgeProps {
  status: CallStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge = memo(function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? 4 : 5,
        padding: size === 'sm' ? '2px 7px' : '4px 10px',
        borderRadius: 20,
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
        color: cfg.color,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
});
