import type { PoseDto } from '@sojourn/shared';

export type PoseCardProps = {
  pose: PoseDto;
  onRegenerate: () => void;
  busy: boolean;
  active: boolean;
  onSelect: () => void;
};

export function PoseCard({ pose, onRegenerate, busy, active, onSelect }: PoseCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        background: '#161616',
        border: `1px solid ${active ? '#7eb8ff' : '#2c2c2c'}`,
        borderRadius: 6,
        width: 120,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`select pose ${pose.name}`}
        style={{
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          alignSelf: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            backgroundImage: `url(${pose.spriteSheetUrl})`,
            backgroundPosition: '0 0',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            backgroundColor: '#1a1a1a',
            border: '1px solid #2c2c2c',
          }}
        />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#ddd' }}>{pose.name}</span>
        <StatusBadge status={pose.status} />
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy}
        style={{
          padding: '4px 8px',
          fontSize: 11,
          background: 'transparent',
          color: busy ? '#555' : '#bbb',
          border: '1px solid #3a3a3a',
          borderRadius: 4,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'regenerating…' : 'regenerate'}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: PoseDto['status'] }) {
  const palette: Record<PoseDto['status'], { bg: string; fg: string }> = {
    pending: { bg: '#3a2c00', fg: '#ffe48a' },
    ready: { bg: '#0f3320', fg: '#9ce0b8' },
    failed: { bg: '#3a0e0e', fg: '#ff8a8a' },
  };
  const { bg, fg } = palette[status];
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 999,
        background: bg,
        color: fg,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {status}
    </span>
  );
}
