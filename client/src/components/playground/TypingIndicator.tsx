import { memo } from 'react';

/* Three animated dots — matches the classic "agent is typing" pattern */
export const TypingIndicator = memo(function TypingIndicator({ accentColor = '#00bcd4' }: { accentColor?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '16px',
        animation: 'pg-fadein 0.25s ease',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: `${accentColor}22`,
          border: `1.5px solid ${accentColor}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 14,
        }}
      >
        🤖
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '18px 18px 18px 4px',
          padding: '12px 18px',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: accentColor,
              display: 'inline-block',
              animation: `pg-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pg-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-8px); opacity: 1; }
        }
        @keyframes pg-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
