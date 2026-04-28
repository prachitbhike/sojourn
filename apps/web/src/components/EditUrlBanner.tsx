import { useState } from 'react';
import { getBannerSeen, setBannerSeen } from '../lib/storage.js';

export type EditUrlBannerProps = { slug: string };

export function EditUrlBanner({ slug }: EditUrlBannerProps) {
  const [dismissed, setDismissed] = useState(() => getBannerSeen(slug));
  if (dismissed) return null;

  const dismiss = () => {
    setBannerSeen(slug);
    setDismissed(true);
  };

  return (
    <div
      role="status"
      style={{
        background: '#3a2c00',
        color: '#ffe48a',
        border: '1px solid #5c4500',
        padding: '10px 14px',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>
        This is the edit URL — keep it private. Anyone with this link can edit your character.
      </span>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: 'transparent',
          color: '#ffe48a',
          border: '1px solid #ffe48a',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Got it
      </button>
    </div>
  );
}
