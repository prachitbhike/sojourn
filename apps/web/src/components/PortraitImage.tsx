import type { GenerationStatus } from '@sojourn/shared';

export type PortraitImageProps = {
  url: string | null;
  status: GenerationStatus;
  alt: string;
  size?: number;
};

export function PortraitImage({ url, status, alt, size = 192 }: PortraitImageProps) {
  const dim = { width: size, height: size };
  const wrapperStyle: React.CSSProperties = {
    ...dim,
    position: 'relative',
    background: '#1a1a1a',
    border: '1px solid var(--sj-border, #333)',
    borderRadius: 6,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: '#bbb',
    background: 'rgba(0,0,0,0.45)',
  };

  return (
    <div style={wrapperStyle} data-status={status}>
      {url ? (
        <img
          src={url}
          alt={alt}
          width={size}
          height={size}
          style={{ ...dim, objectFit: 'contain' }}
        />
      ) : (
        <span style={{ color: '#888', fontSize: 12 }}>no portrait</span>
      )}
      {status === 'pending' && <div style={overlayStyle}>generating…</div>}
      {status === 'failed' && (
        <div style={{ ...overlayStyle, color: '#ff8a8a' }}>generation failed</div>
      )}
    </div>
  );
}
