import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface KnowledgeCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

export const KnowledgeCard = memo(function KnowledgeCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled
}: KnowledgeCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        background: '#0a0a0a',
        border: '1px solid #1e1e1e',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = '#00bcd4';
          e.currentTarget.style.background = '#0a0a0a';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 188, 212, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = '#1e1e1e';
          e.currentTarget.style.background = '#0a0a0a';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: disabled ? '#1a1a1a' : '#00bcd415',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: disabled ? '#555' : '#00bcd4'
        }}>
          <Icon size={20} />
        </div>
        {!disabled && (
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: '#111',
            border: '1px solid #222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00bcd4',
            fontSize: '16px',
            fontWeight: '600'
          }}>
            +
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
          {description}
        </div>
      </div>
    </div>
  );
});
