import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accentColor: string;
  change?: number;       // percentage change vs previous period
  suffix?: string;       // e.g. '%', 's', 'ms'
  loading?: boolean;
}

export const KPICard = memo(function KPICard({
  label,
  value,
  icon: Icon,
  accentColor,
  change,
  suffix = '',
  loading = false,
}: KPICardProps) {
  const TrendIcon = change == null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const trendColor = change == null || change === 0 ? '#666' : change > 0 ? '#22c55e' : '#ef4444';

  if (loading) {
    return (
      <div style={{
        background: '#0e0e0e',
        border: '1px solid #1e1e1e',
        borderRadius: 14,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1a1a1a', animation: 'sk-pulse 1.4s ease infinite' }} />
        <div style={{ width: '55%', height: 14, borderRadius: 6, background: '#1a1a1a', animation: 'sk-pulse 1.4s ease 0.1s infinite' }} />
        <div style={{ width: '35%', height: 28, borderRadius: 6, background: '#1a1a1a', animation: 'sk-pulse 1.4s ease 0.2s infinite' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#0e0e0e',
        border: `1px solid #1e1e1e`,
        borderRadius: 14,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'border-color 0.2s, transform 0.15s',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseOver={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${accentColor}40`;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseOut={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#1e1e1e';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        top: -30,
        right: -20,
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: `${accentColor}08`,
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: `${accentColor}18`,
        border: `1px solid ${accentColor}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} style={{ color: accentColor }} />
      </div>

      {/* Label */}
      <div style={{ fontSize: 12, color: '#666', fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </div>

      {/* Value */}
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
        {value}{suffix}
      </div>

      {/* Trend */}
      {change != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <TrendIcon size={13} style={{ color: trendColor }} />
          <span style={{ fontSize: 12, color: trendColor, fontWeight: 600 }}>
            {change > 0 ? '+' : ''}{change}%
          </span>
          <span style={{ fontSize: 12, color: '#444' }}>vs last period</span>
        </div>
      )}
    </div>
  );
});
