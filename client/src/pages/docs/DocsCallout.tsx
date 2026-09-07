import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, Info, Lightbulb, XOctagon } from 'lucide-react';

interface DocsCalloutProps {
  type: 'note' | 'warning' | 'important' | 'security' | 'tip' | 'failure';
  title?: string;
  children: React.ReactNode;
}

export default function DocsCallout({ type, title, children }: DocsCalloutProps) {
  const config = {
    note: {
      borderLeft: '4px solid #0ea5e9',
      background: 'rgba(14, 165, 233, 0.05)',
      color: '#38bdf8',
      icon: <Info size={16} />,
      defaultTitle: 'NOTE'
    },
    warning: {
      borderLeft: '4px solid #f59e0b',
      background: 'rgba(245, 158, 11, 0.05)',
      color: '#fbbf24',
      icon: <AlertTriangle size={16} />,
      defaultTitle: 'WARNING'
    },
    important: {
      borderLeft: '4px solid #8b5cf6',
      background: 'rgba(139, 92, 246, 0.05)',
      color: '#a78bfa',
      icon: <AlertCircle size={16} />,
      defaultTitle: 'IMPORTANT'
    },
    security: {
      borderLeft: '4px solid #f43f5e',
      background: 'rgba(244, 63, 94, 0.05)',
      color: '#fb7185',
      icon: <ShieldAlert size={16} />,
      defaultTitle: 'SECURITY'
    },
    tip: {
      borderLeft: '4px solid #10b981',
      background: 'rgba(16, 185, 129, 0.05)',
      color: '#34d399',
      icon: <Lightbulb size={16} />,
      defaultTitle: 'TIP'
    },
    failure: {
      borderLeft: '4px solid #ef4444',
      background: 'rgba(239, 68, 68, 0.05)',
      color: '#f87171',
      icon: <XOctagon size={16} />,
      defaultTitle: 'FAILURE MODE'
    }
  }[type];

  return (
    <div style={{
      padding: '16px',
      margin: '20px 0',
      borderRadius: '0 8px 8px 0',
      lineHeight: '1.6',
      fontSize: '14px',
      background: config.background,
      borderLeft: config.borderLeft,
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
      borderLeftWidth: '4px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontWeight: 700,
        fontSize: '12px',
        letterSpacing: '0.05em',
        marginBottom: '6px',
        color: config.color
      }}>
        {config.icon}
        <span>{title || config.defaultTitle}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
