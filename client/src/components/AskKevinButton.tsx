import type { ReactNode } from 'react';

interface AskKevinButtonProps {
  className?: string;
  children?: ReactNode;
}

export default function AskKevinButton({ className = '', children }: AskKevinButtonProps) {
  return (
    <button
      type="button"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full px-5 py-3 text-[16px] font-semibold shadow-[0_18px_40px_var(--shadow-color)] transition-colors ${className}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        '--shadow-color': 'var(--shadow-light)',
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border text-[18px]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-accent)' }}
      >
        O
      </span>
      {children ?? 'Ask Kevin'}
    </button>
  );
}
