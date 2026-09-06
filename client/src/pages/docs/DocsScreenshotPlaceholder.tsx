import { Monitor, MousePointerClick } from 'lucide-react';

interface DocsScreenshotPlaceholderProps {
  title: string;
  description: string;
  elements?: { label: string; value: string; type?: 'button' | 'input' | 'badge' | 'text' }[];
  routePath?: string;
}

export default function DocsScreenshotPlaceholder({
  title,
  description,
  elements,
  routePath
}: DocsScreenshotPlaceholderProps) {
  return (
    <div style={{
      margin: '24px 0',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)'
    }}>
      {/* Window Titlebar */}
      <div style={{
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          </div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Monitor size={14} style={{ color: 'var(--teal)' }} />
            {title}
          </span>
        </div>
        {routePath && (
          <code style={{
            fontSize: '11px',
            background: 'var(--bg-secondary)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            color: 'var(--teal-fg)'
          }}>
            {routePath}
          </code>
        )}
      </div>

      {/* Placeholder Content Area */}
      <div style={{ padding: '20px' }}>
        <p style={{
          fontSize: '13.5px',
          color: 'var(--text-secondary)',
          marginTop: 0,
          marginBottom: elements && elements.length > 0 ? '16px' : '0',
          lineHeight: 1.5
        }}>
          {description}
        </p>

        {elements && elements.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '10px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '14px'
          }}>
            {elements.map((el, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '12px'
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.04em' }}>
                  {el.label}
                </span>
                <span style={{
                  color: el.type === 'button' ? 'var(--teal-fg)' : 'var(--text-primary)',
                  fontWeight: el.type === 'button' ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-secondary)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)'
                }}>
                  {el.type === 'button' && <MousePointerClick size={12} />}
                  {el.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
