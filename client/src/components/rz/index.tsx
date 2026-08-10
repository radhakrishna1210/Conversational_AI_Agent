/**
 * Resonance composites.
 *
 * styles/resonance.css names the *shapes* the design language is built from;
 * this file names the handful of **compositions** that appear on nearly every
 * screen — a page header with an eyebrow, a KPI tile, a labelled meter, a
 * segmented control, an empty state.
 *
 * Anything used once belongs in its page. Anything that is purely a class name
 * belongs in the stylesheet. This is the middle: markup that would otherwise be
 * retyped identically ten times, where a typo in one copy is a visual bug
 * nobody notices for a month.
 */
import React from 'react';

export type Tone = 'ok' | 'info' | 'think' | 'warn' | 'speak' | 'err' | 'idle';

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

/* ── Page scaffold ────────────────────────────────────────────── */

/**
 * The scrolling product-page canvas: ambient wash, padding, centred column.
 *
 * `width="full"` opts out of the 1080px column for screens that are genuinely
 * edge-to-edge (split views, tables that need every pixel).
 */
export function RzPage({
  children,
  width = 'default',
  pad = true,
  className,
  style,
}: {
  children: React.ReactNode;
  width?: 'default' | 'wide' | 'full';
  pad?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const inner =
    width === 'full' ? (
      children
    ) : (
      <div className={width === 'wide' ? 'rz-wrap-wide' : 'rz-wrap'}>{children}</div>
    );
  return (
    <div className={cx('rz-page', pad && 'rz-page-pad', className)} style={style}>
      {inner}
    </div>
  );
}

/** Eyebrow → title → subtitle on the left, actions on the right. */
export function RzHead({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rz-head">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="rz-eyebrow">{eyebrow}</div>}
        <h1 className="rz-h1">{title}</h1>
        {subtitle && (
          <p className="rz-sub" style={{ margin: '8px 0 0', maxWidth: 640 }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="rz-head-actions">{actions}</div>}
    </div>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────── */

export function RzCard({
  title,
  label,
  actions,
  children,
  size = 'md',
  flush = false,
  className,
  style,
}: {
  title?: React.ReactNode;
  /** Mono uppercase marker above the title, e.g. "AI SUMMARY". */
  label?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  flush?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hasHeader = title || label || actions;
  return (
    <div
      className={cx(
        'rz-card',
        size === 'sm' && 'rz-card-sm',
        size === 'lg' && 'rz-card-lg',
        flush && 'rz-card-flush',
        className,
      )}
      style={style}
    >
      {hasHeader && (
        <div
          className="rz-between"
          style={{ marginBottom: 14, padding: flush ? '16px 18px 0' : undefined }}
        >
          <div style={{ minWidth: 0 }}>
            {label && <div className="rz-label" style={{ marginBottom: 4 }}>{label}</div>}
            {title && <div className="rz-title">{title}</div>}
          </div>
          {actions && <div className="rz-cluster-sm">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Instruments ──────────────────────────────────────────────── */

export function RzStat({
  label,
  value,
  delta,
  trend,
  color,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  /** Colours the delta line. Omit for a neutral note. */
  trend?: 'up' | 'down';
  /** Overrides the value colour — for a KPI whose number *is* a status. */
  color?: string;
}) {
  return (
    <div className="rz-stat">
      <div className="rz-stat-label">{label}</div>
      <div className="rz-stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      {delta != null && (
        <div
          className={cx(
            'rz-stat-delta',
            trend === 'up' && 'is-up',
            trend === 'down' && 'is-down',
          )}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

export function RzPill({
  tone = 'idle',
  children,
  dot = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  /** Leads with a status dot — for pills that describe something *live*. */
  dot?: boolean;
}) {
  const dotTone: Partial<Record<Tone, string>> = {
    ok: 'rz-dot',
    info: 'rz-dot rz-dot-cyan',
    warn: 'rz-dot rz-dot-warn',
    err: 'rz-dot rz-dot-err',
    idle: 'rz-dot rz-dot-idle',
  };
  return (
    <span className={`rz-pill rz-pill-${tone}`}>
      {dot && <span className={dotTone[tone] ?? 'rz-dot'} style={{ width: 6, height: 6 }} />}
      {children}
    </span>
  );
}

/**
 * A meter with an optional label row.
 *
 * `segments` takes the *filled* portions only; the track shows through for the
 * remainder. Multi-segment is how the designs draw a campaign's done/in-flight
 * split in one bar.
 */
export function RzMeter({
  label,
  value,
  segments,
  size = 'md',
  hint,
}: {
  label?: React.ReactNode;
  /** 0–100. Ignored when `segments` is given. */
  value?: number;
  segments?: Array<{ pct: number; className?: string; color?: string }>;
  size?: 'md' | 'lg';
  hint?: React.ReactNode;
}) {
  const parts =
    segments ?? [{ pct: Math.max(0, Math.min(100, value ?? 0)), className: undefined }];
  return (
    <div>
      {(label || hint) && (
        <div className="rz-between" style={{ fontSize: 13, marginBottom: 5 }}>
          <span>{label}</span>
          {hint != null && (
            <span className="rz-mono" style={{ color: 'var(--tx-2)' }}>
              {hint}
            </span>
          )}
        </div>
      )}
      <div className={cx('rz-meter', size === 'lg' && 'rz-meter-lg')}>
        {parts.map((p, i) => (
          <div
            key={i}
            className={cx('rz-meter-fill', p.className)}
            style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, background: p.color }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────── */

export function RzTabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'segmented',
  className,
}: {
  tabs: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  variant?: 'segmented' | 'underline';
  className?: string;
}) {
  const underline = variant === 'underline';
  return (
    <div className={cx(underline ? 'rz-utabs' : 'rz-tabs', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={cx(underline ? 'rz-utab' : 'rz-tab', value === t.value && 'is-active')}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function RzSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('rz-switch', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    />
  );
}

export function RzSearch({
  value,
  onChange,
  placeholder = 'Search…',
  kbd,
  onClick,
  readOnly,
  style,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  kbd?: string;
  onClick?: () => void;
  readOnly?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className="rz-search" style={style} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--tx-3)', flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={onClick ? { cursor: 'pointer' } : undefined}
      />
      {kbd && <span className="rz-kbd">{kbd}</span>}
    </div>
  );
}

/* ── States ───────────────────────────────────────────────────── */

export function RzEmpty({
  icon,
  title,
  text,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  text?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rz-empty">
      {icon && <div className="rz-empty-mark">{icon}</div>}
      <div className="rz-empty-title">{title}</div>
      {text && <div className="rz-empty-text">{text}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/** Rows of shimmer sized like the content they stand in for. */
export function RzSkeleton({
  rows = 3,
  height = 56,
  gap = 10,
}: {
  rows?: number;
  height?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rz-skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function RzSpinner({ label }: { label?: string }) {
  return (
    <span className="rz-cluster-sm" role="status">
      <span className="rz-spinner" />
      {label && <span className="rz-mono">{label}</span>}
    </span>
  );
}
