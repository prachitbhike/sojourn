export const POSE_NAMES = ['idle', 'walk', 'attack', 'cast'] as const;

export type PoseName = (typeof POSE_NAMES)[number];

export function isPoseName(value: string): value is PoseName {
  return (POSE_NAMES as readonly string[]).includes(value);
}
