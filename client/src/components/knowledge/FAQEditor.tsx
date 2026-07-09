import { useState } from 'react';
import { Plus, GripVertical, Trash2, X, Save } from 'lucide-react';
import type { FAQItem } from '../../data/mockKnowledge';

interface FAQEditorProps {
  onCancel: () => void;
}

export function FAQEditor({ onCancel }: FAQEditorProps) {
  const [faqs, setFaqs] = useState<FAQItem[]>([
    { id: '1', question: '', answer: '' }
  ]);

  const updateFaq = (id: string, field: keyof FAQItem, value: string) => {
    setFaqs(faqs.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const addFaq = () => {
    setFaqs([...faqs, { id: Math.random().toString(), question: '', answer: '' }]);
  };

  const removeFaq = (id: string) => {
    if (faqs.length === 1) return;
    setFaqs(faqs.filter(f => f.id !== id));
  };

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '14px', position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#fff' }}>FAQ Builder</h3>
          <div style={{ fontSize: '12px', color: '#888' }}>Create structured question and answer pairs.</div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {faqs.map((faq, idx) => (
          <div key={faq.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ padding: '10px 0', color: '#444', cursor: 'grab' }}>
              <GripVertical size={16} />
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginTop: '8px', width: '20px' }}>Q.</div>
                <input
                  type="text"
                  value={faq.question}
                  onChange={e => updateFaq(faq.id, 'question', e.target.value)}
                  placeholder="Enter common question..."
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', padding: '8px 0', borderBottom: '1px solid #2a2a2a' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginTop: '8px', width: '20px' }}>A.</div>
                <textarea
                  value={faq.answer}
                  onChange={e => updateFaq(faq.id, 'answer', e.target.value)}
                  placeholder="Enter the corresponding answer..."
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#aaa', fontSize: '13px', padding: '8px 0', minHeight: '60px', resize: 'vertical' }}
                />
              </div>
            </div>

            <button
              onClick={() => removeFaq(faq.id)}
              disabled={faqs.length === 1}
              style={{
                padding: '10px',
                background: 'none',
                border: 'none',
                color: faqs.length === 1 ? '#333' : '#666',
                cursor: faqs.length === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        <button
          onClick={addFaq}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '12px', background: 'transparent', border: '1px dashed #333', borderRadius: '8px',
            color: '#888', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginTop: '8px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#00bcd4'; e.currentTarget.style.color = '#00bcd4'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}
        >
          <Plus size={16} />
          Add Question
        </button>
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid #1a1a1a', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#00bcd4', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <Save size={14} />
          Save FAQs
        </button>
      </div>
    </div>
  );
}
