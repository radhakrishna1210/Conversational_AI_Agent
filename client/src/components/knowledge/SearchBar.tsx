import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search knowledge...' }: SearchBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      background: '#111',
      border: '1px solid #222',
      borderRadius: '8px',
      padding: '10px 14px',
      transition: 'border-color 0.2s ease',
      width: '100%',
    }}
    onFocus={(e) => e.currentTarget.style.borderColor = '#00bcd4'}
    onBlur={(e) => e.currentTarget.style.borderColor = '#222'}
    >
      <Search size={16} style={{ color: '#555', flexShrink: 0 }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#e8e8e8',
          fontSize: '14px',
          width: '100%'
        }}
      />
    </div>
  );
}
