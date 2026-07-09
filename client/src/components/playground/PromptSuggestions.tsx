import { memo } from 'react';
import { Sparkles } from 'lucide-react';

interface PromptSuggestionsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  accentColor: string;
}

export const PromptSuggestions = memo(function PromptSuggestions({
  prompts,
  onSelect,
  accentColor,
}: PromptSuggestionsProps) {
  return (
    <div style={{ padding: '8px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          fontSize: 11,
          color: '#555',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        <Sparkles size={11} style={{ color: accentColor }} />
        Suggested Prompts
      </div>

      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          title={`Send: "${prompt}"`}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}35`,
            color: accentColor,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s, transform 0.1s',
            fontFamily: 'var(--font-main, inherit)',
            whiteSpace: 'nowrap',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = `${accentColor}22`;
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = `${accentColor}12`;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
});
