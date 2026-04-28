import type { PoseDto, PoseName } from '@sojourn/shared';
import { AddPosePicker } from './AddPosePicker.js';
import { PoseCard } from './PoseCard.js';

export type PoseGridProps = {
  poses: PoseDto[];
  available: PoseName[];
  busyPose: PoseName | null;
  currentPoseName: PoseName | null;
  onSelect: (name: PoseName) => void;
  onRegenerate: (name: PoseName) => void;
  onAdd: (name: PoseName) => void;
};

export function PoseGrid({
  poses,
  available,
  busyPose,
  currentPoseName,
  onSelect,
  onRegenerate,
  onAdd,
}: PoseGridProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {poses.map((pose) => (
        <PoseCard
          key={pose.id}
          pose={pose}
          busy={busyPose === pose.name}
          active={currentPoseName === pose.name}
          onSelect={() => onSelect(pose.name)}
          onRegenerate={() => onRegenerate(pose.name)}
        />
      ))}
      <AddPosePicker
        available={available}
        onAdd={onAdd}
        busy={busyPose !== null && available.includes(busyPose)}
      />
    </div>
  );
}
