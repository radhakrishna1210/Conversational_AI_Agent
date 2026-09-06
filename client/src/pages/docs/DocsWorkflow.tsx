import React from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';

export interface WorkflowStep {
  title: string;
  description: string;
  badge?: string;
  icon?: React.ReactNode;
  accent?: string;
}

interface DocsWorkflowProps {
  title?: string;
  description?: string;
  steps: WorkflowStep[];
  orientation?: 'horizontal' | 'vertical';
}

export default function DocsWorkflow({
  title,
  description,
  steps,
  orientation = 'horizontal'
}: DocsWorkflowProps) {
  return (
    <div style={{
      margin: '28px 0',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
    }}>
      {title && (
        <div style={{ marginBottom: description ? 6 : 18 }}>
          <div style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--teal)'
            }} />
            {title}
          </div>
        </div>
      )}
      {description && (
        <p style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
          lineHeight: 1.5
        }}>
          {description}
        </p>
      )}

      <div style={{
        display: 'flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'stretch',
        justifyContent: 'flex-start'
      }}>
        {steps.map((step, idx) => {
          const accentColor = step.accent || 'var(--teal)';
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={idx}>
              <div style={{
                flex: orientation === 'horizontal' ? '1 1 200px' : '1 1 100%',
                minWidth: orientation === 'horizontal' ? '180px' : 'auto',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '16px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, border-color 0.15s ease'
              }}>
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <span style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: accentColor,
                      background: 'var(--bg-secondary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)'
                    }}>
                      {step.badge || `STEP 0${idx + 1}`}
                    </span>
                    {step.icon && (
                      <span style={{ color: accentColor, display: 'flex', alignItems: 'center' }}>
                        {step.icon}
                      </span>
                    )}
                  </div>

                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 6px 0',
                    lineHeight: 1.3
                  }}>
                    {step.title}
                  </h4>

                  <p style={{
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.45
                  }}>
                    {step.description}
                  </p>
                </div>
              </div>

              {!isLast && orientation === 'horizontal' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  padding: '0 2px'
                }}>
                  <ArrowRight size={18} />
                </div>
              )}

              {!isLast && orientation === 'vertical' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  padding: '4px 0'
                }}>
                  <ArrowDown size={18} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
