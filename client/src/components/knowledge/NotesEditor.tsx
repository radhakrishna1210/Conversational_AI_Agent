import { useState, useEffect } from 'react';
import { X, Save, Check } from 'lucide-react';

interface NotesEditorProps {
  onCancel: () => void;
}

export function NotesEditor({ onCancel }: NotesEditorProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-save simulation
  useEffect(() => {
    if (!content) return;
    const timer = setTimeout(() => {
      setSaving(true);
      setTimeout(() => {
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 600);
    }, 1000);
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '14px', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#fff' }}>Plain Text Notes</h3>
          <div style={{ fontSize: '12px', color: '#888' }}>Write freeform knowledge instructions directly.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saving ? 'Saving...' : saved ? <><Check size={12} style={{ color: '#22c55e' }}/> Saved</> : 'Auto-saves locally'}
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing instructions, facts, or context for your agent..."
          style={{
            flex: 1,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e8e8e8',
            fontSize: '14px',
            lineHeight: '1.6',
            resize: 'none',
          }}
        />
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#555' }}>
          {content.length} characters
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onCancel} disabled={!content} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: content ? '#00bcd4' : '#1a1a1a', border: 'none', borderRadius: '6px', color: content ? '#000' : '#555', fontSize: '13px', fontWeight: '600', cursor: content ? 'pointer' : 'not-allowed' }}>
            <Save size={14} />
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
