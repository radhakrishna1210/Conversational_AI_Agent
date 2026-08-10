import { BRAND } from '@/lib/brand';

/**
 * The Spandan mark: a hairline ring with a glowing core — a pulse, which is
 * what "spandan" means and what the whole design language is built around.
 *
 * Deliberately CSS rather than an SVG asset so the ring inherits --cyan. The
 * mark then shifts with the theme and, where a surface drives it from live
 * agent state, can take a conversation-state colour without shipping six files.
 */

interface SpandanLogoProps {
  /** Mark diameter in px. The wordmark scales from it. */
  size?: number;
  /** Hide the wordmark to show the mark alone (collapsed rails, favicons, avatars). */
  markOnly?: boolean;
  /** Small tracked mono line under the wordmark, e.g. "DESIGN SYSTEM" or a workspace name. */
  sublabel?: string;
  /** Overrides the ring colour — pass a voice-state colour to make the mark live. */
  color?: string;
  className?: string;
}

export default function SpandanLogo({
  size = 24,
  markOnly = false,
  sublabel,
  color = 'var(--cyan)',
  className,
}: SpandanLogoProps) {
  const mark = (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `1.5px solid ${color}`,
          opacity: 0.85,
        }}
      />
      <span
        style={{
          width: Math.max(3, Math.round(size * 0.21)),
          height: Math.max(3, Math.round(size * 0.21)),
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
    </span>
  );

  if (markOnly) {
    return (
      <span className={className} aria-label={BRAND.name} role="img">
        {mark}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx)' }}
    >
      {mark}
      <span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--ff-d)',
            fontWeight: 700,
            fontSize: size * 0.625,
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}
        >
          {BRAND.name}
        </span>
        {sublabel && (
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--ff-m)',
              fontSize: 9,
              letterSpacing: '1.5px',
              color: 'var(--tx-3)',
              marginTop: 2,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
    </span>
  );
}
