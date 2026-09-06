interface DocsImageProps {
  src: string;
  alt: string;
  caption?: string;
}

export default function DocsImage({ src, alt, caption }: DocsImageProps) {
  return (
    <figure style={{
      margin: '24px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
      maxWidth: '850px'
    }}>
      <div style={{
        width: '100%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
      }}>
        <img 
          src={src} 
          alt={alt} 
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            objectFit: 'contain'
          }} 
        />
      </div>
      {caption && (
        <figcaption style={{
          marginTop: '10px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          fontStyle: 'italic',
          lineHeight: 1.4
        }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
