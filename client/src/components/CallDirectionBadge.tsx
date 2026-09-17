import type { CSSProperties } from 'react';
import { PhoneIncoming, PhoneOutgoing, HelpCircle } from 'lucide-react';
import { CallDirection, DIRECTION_LABEL, DIRECTION_SUMMARY } from '@/lib/callDirection';

/*
  The one visual for an agent's call direction, so the dashboard list, the
  agent editor and the pickers all read the same: teal for Inbound, orange for
  Outbound — the colours the editor's direction pill already used.
*/
const TONE: Record<CallDirection, { fg: string; bg: string; border: string }> = {
  INBOUND: { fg: 'var(--cyan-fg)', bg: 'rgba(14,179,158,0.12)', border: 'rgba(14,179,158,0.35)' },
  OUTBOUND: { fg: 'var(--orange)', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
};

export function CallDirectionBadge({
  direction,
  size = 'sm',
  style,
}: {
  direction: CallDirection | null;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const iconSize = size === 'md' ? 14 : 12;
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: size === 'md' ? '4px 11px' : '2px 8px',
    borderRadius: 999,
    fontSize: size === 'md' ? 12 : 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    lineHeight: 1.4,
  };

  if (!direction) {
    return (
      <span
        title="This agent was created before agents had a call direction. Open it and choose Inbound or Outbound."
        style={{ ...base, color: 'var(--tx-3)', border: '1px dashed var(--line-2)', ...style }}
      >
        <HelpCircle size={iconSize} aria-hidden="true" />
        Direction not set
      </span>
    );
  }

  const tone = TONE[direction];
  const Icon = direction === 'OUTBOUND' ? PhoneOutgoing : PhoneIncoming;
  return (
    <span
      title={DIRECTION_SUMMARY[direction]}
      style={{ ...base, color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`, ...style }}
    >
      <Icon size={iconSize} aria-hidden="true" />
      {DIRECTION_LABEL[direction]}
    </span>
  );
}
