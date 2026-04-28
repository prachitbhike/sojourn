import type { PoseDto, PoseName } from '@sojourn/shared';
import { SpriteStage } from './SpriteStage/index.js';

export type PoseStageProps = {
  poses: PoseDto[];
  currentPoseName: PoseName;
  onSelect: (name: PoseName) => void;
};

export function PoseStage({ poses, currentPoseName, onSelect }: PoseStageProps) {
  const current = poses.find((p) => p.name === currentPoseName) ?? poses[0];

  // SpriteStage caches Phaser textures by `currentPose`. If the user regenerates a pose,
  // the URL changes but the name doesn't — versioning the prop with `updatedAt` forces
  // a fresh texture key. SpriteStage itself is locked per the slice brief.
  const versionedKey = current ? `${current.name}#${current.updatedAt}` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <span style={{ color: '#666' }}>pose</span>
        <select
          value={currentPoseName}
          onChange={(e) => onSelect(e.target.value as PoseName)}
          disabled={poses.length === 0}
          style={{ padding: '4px 8px', fontSize: 13 }}
        >
          {poses.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {current ? (
        <SpriteStage
          spriteSheetUrl={current.spriteSheetUrl}
          manifest={current.manifest}
          currentPose={versionedKey}
        />
      ) : (
        <div
          style={{
            width: 256,
            height: 256,
            background: '#1a1a1a',
            color: '#666',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--sj-border, #333)',
          }}
        >
          no poses yet — add one below
        </div>
      )}
    </div>
  );
}
