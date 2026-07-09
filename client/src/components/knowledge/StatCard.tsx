import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
}

export const StatCard = memo(function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1e1e1e',
      borderRadius: '12px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px'
    }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '10px',
        background: '#111',
        border: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888'
      }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          {label}
        </div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
          {value}
        </div>
      </div>
    </div>
  );
});
