import { useState } from 'react';
import { X, LayoutGrid } from 'lucide-react';
import { agentTemplates, type AgentTemplate } from '../data/agentTemplates';

/* ══════════════════════════════════════════════════════
   TemplateBanner
   Shown at the top of Dashboard or EditAgent when a
   template param is active.
══════════════════════════════════════════════════════ */

interface TemplateBannerProps {
  template: AgentTemplate;
  onChangeTemplate: () => void;
  onDismiss?: () => void;
}

export function TemplateBanner({ template, onChangeTemplate, onDismiss }: TemplateBannerProps) {
  const Icon = template.icon;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        background: `${template.accentColor}12`,
        border: `1px solid ${template.accentColor}40`,
        borderRadius: '10px',
        marginBottom: 24,
        position: 'relative',
      }}
    >
      {/* Left icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: `${template.accentColor}20`,
          border: `1px solid ${template.accentColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={20} style={{ color: template.accentColor }} />
      </div>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: template.accentColor, letterSpacing: '0.08em' }}>
            TEMPLATE ACTIVE
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          Creating: {template.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          {template.shortDescription}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={onChangeTemplate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            background: `${template.accentColor}18`,
            border: `1px solid ${template.accentColor}50`,
            color: template.accentColor,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: 'var(--font-main)',
          }}
          onMouseOver={e => (e.currentTarget.style.background = `${template.accentColor}30`)}
          onMouseOut={e  => (e.currentTarget.style.background = `${template.accentColor}18`)}
        >
          <LayoutGrid size={13} />
          Change Template
        </button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss template banner"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TemplatePickerModal
   Full-screen overlay listing all available templates.
   Selecting one calls onSelect(template) and closes.
══════════════════════════════════════════════════════ */

interface TemplatePickerModalProps {
  currentId: string;
  onSelect: (template: AgentTemplate) => void;
  onClose: () => void;
}

export function TemplatePickerModal({ currentId, onSelect, onClose }: TemplatePickerModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: 700,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px', margin: 0 }}>
              Choose a Template
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 0 }}>
              Selecting a template will update the form fields. Fields you've already edited manually will not be changed.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close template picker"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Template grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 28 }}>
          {agentTemplates.map(tpl => {
            const TplIcon = tpl.icon;
            const isActive = tpl.id === currentId;
            const isHov = hovered === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => onSelect(tpl)}
                onMouseOver={() => setHovered(tpl.id)}
                onMouseOut={() => setHovered(null)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '20px',
                  background: isActive ? `${tpl.accentColor}14` : isHov ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                  border: `1px solid ${isActive ? tpl.accentColor + '60' : isHov ? tpl.accentColor + '30' : 'var(--border)'}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, border-color 0.15s',
                  fontFamily: 'var(--font-main)',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 12,
                      fontSize: 10,
                      fontWeight: 700,
                      color: tpl.accentColor,
                      letterSpacing: '0.06em',
                    }}
                  >
                    ACTIVE
                  </div>
                )}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: `${tpl.accentColor}20`,
                    border: `1px solid ${tpl.accentColor}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <TplIcon size={22} style={{ color: tpl.accentColor }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
                    {tpl.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {tpl.shortDescription}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                    {tpl.suggestedTools.slice(0, 3).map(tool => (
                      <span
                        key={tool}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: `${tpl.accentColor}15`,
                          color: tpl.accentColor,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
