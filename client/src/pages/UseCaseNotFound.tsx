import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { useCases } from '../data/useCases';

export default function UseCaseNotFound() {
  return (
    <main
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '60px 24px',
        background: 'var(--bg-primary)',
        fontFamily: 'var(--font-main)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        <AlertCircle size={36} style={{ color: '#f87171' }} />
      </div>

      {/* 404 */}
      <div
        style={{
          fontSize: 'clamp(80px, 12vw, 140px)',
          fontWeight: 900,
          letterSpacing: '-6px',
          lineHeight: 1,
          background: 'linear-gradient(135deg, #f87171 0%, #fb923c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 16,
        }}
      >
        404
      </div>

      <h1
        style={{
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.5px',
          marginBottom: 16,
        }}
      >
        Use Case Not Found
      </h1>

      <p
        style={{
          fontSize: 16,
          color: 'var(--text-secondary)',
          maxWidth: 440,
          lineHeight: 1.7,
          marginBottom: 48,
        }}
      >
        The use case you're looking for doesn't exist. Browse our available use cases below or head back to the home page.
      </p>

      {/* Available use cases */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
          maxWidth: 620,
          marginBottom: 48,
        }}
      >
        {useCases.map((uc) => (
          <Link
            key={uc.slug}
            to={`/use-cases/${uc.slug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 'var(--radius-full)',
              background: `${uc.accentColor}14`,
              border: `1px solid ${uc.accentColor}40`,
              color: uc.accentColor,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              transition: 'background 0.2s, transform 0.15s',
            }}
            onMouseOver={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = `${uc.accentColor}28`;
              el.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = `${uc.accentColor}14`;
              el.style.transform = 'translateY(0)';
            }}
          >
            <uc.icon size={14} />
            {uc.title}
          </Link>
        ))}
      </div>

      {/* Back home */}
      <Link
        to="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '13px 28px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, #0eb39e, #0575e6)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          textDecoration: 'none',
          boxShadow: '0 4px 20px rgba(14,179,158,0.35)',
          transition: 'transform 0.2s',
        }}
        onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
        onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
      >
        Back to Home <ArrowRight size={16} />
      </Link>
    </main>
  );
}
