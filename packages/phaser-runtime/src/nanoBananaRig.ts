import Phaser from "phaser";

import type { PersonaDefinition } from "@npc-creator/types";

type WalkDirection = "up" | "down" | "left" | "right";
type RigDirection = WalkDirection | "idle";

export interface NanoBananaRigOptions {
  readonly scene: Phaser.Scene;
  readonly persona: PersonaDefinition;
  readonly textureKey?: string;
  readonly x?: number;
  readonly y?: number;
  readonly depth?: number;
  readonly scale?: number;
}

export class NanoBananaRig {
  private readonly scene: Phaser.Scene;
  private readonly persona: PersonaDefinition;
  private readonly textureKey: string;
  private readonly idleKey: string;
  private readonly talkKey: string;
  private readonly walkKeys?: Record<WalkDirection, string>;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private currentDirection: RigDirection = "idle";
  private isTalking = false;
  private currentAnimationKey: string;

  constructor(options: NanoBananaRigOptions) {
    this.scene = options.scene;
    this.persona = options.persona;
    this.textureKey = options.textureKey ?? personaTextureKey(this.persona);
    this.idleKey = `${this.textureKey}-idle`;
    this.talkKey = `${this.textureKey}-talk`;

    this.walkKeys = ensureAnimations(
      this.scene,
      this.persona,
      this.textureKey,
      this.idleKey,
      this.talkKey
    );

    const { frameDimensions } = this.persona.visual;
    const x = options.x ?? frameDimensions.width / 2;
    const y = options.y ?? frameDimensions.height / 2;

    this.sprite = this.scene.add
      .sprite(x, y, this.textureKey)
      .setDepth(options.depth ?? 0)
      .setScale(options.scale ?? 1.6)
      .play(this.idleKey);

    this.currentAnimationKey = this.idleKey;
  }

  public setTalking(isTalking: boolean): void {
    if (this.isTalking === isTalking) {
      return;
    }

    this.isTalking = isTalking;
    this.updateAnimation();
  }

  public setDirection(direction: RigDirection): void {
    const resolvedDirection: RigDirection =
      direction === "idle" || !this.walkKeys || !this.walkKeys[direction as WalkDirection]
        ? "idle"
        : (direction as WalkDirection);

    if (this.currentDirection === resolvedDirection) {
      return;
    }

    this.currentDirection = resolvedDirection;
    this.updateAnimation();
  }

  public destroy(): void {
    this.sprite.destroy();
  }

  private updateAnimation(): void {
    const nextKey = this.resolveAnimationKey();
    if (nextKey === this.currentAnimationKey) {
      return;
    }

    this.sprite.play(nextKey, true);
    this.currentAnimationKey = nextKey;
  }

  private resolveAnimationKey(): string {
    if (this.isTalking) {
      return this.talkKey;
    }

    if (this.currentDirection === "idle" || !this.walkKeys) {
      return this.idleKey;
    }

    const walkKey = this.walkKeys[this.currentDirection];
    return walkKey ?? this.idleKey;
  }
}

const preparedSpriteSheets = new Set<string>();
const preparedAnimations = new Set<string>();

export function preloadNanoBananaSpritesheet(
  scene: Phaser.Scene,
  persona: PersonaDefinition,
  textureKey?: string
): string {
  const resolvedTextureKey = textureKey ?? personaTextureKey(persona);

  if (preparedSpriteSheets.has(resolvedTextureKey)) {
    return resolvedTextureKey;
  }

  const { frameDimensions, spriteSheetPath } = persona.visual;

  scene.load.spritesheet(resolvedTextureKey, spriteSheetPath, {
    frameWidth: frameDimensions.width,
    frameHeight: frameDimensions.height
  });

  preparedSpriteSheets.add(resolvedTextureKey);
  return resolvedTextureKey;
}

function ensureAnimations(
  scene: Phaser.Scene,
  persona: PersonaDefinition,
  textureKey: string,
  idleKey: string,
  talkKey: string
): Record<WalkDirection, string> | undefined {
  if (!preparedAnimations.has(idleKey)) {
    scene.anims.create({
      key: idleKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: persona.visual.animations.idle.startFrame,
        end: persona.visual.animations.idle.endFrame
      }),
      frameRate: persona.visual.animations.idle.frameRate,
      repeat: persona.visual.animations.idle.loop ? -1 : 0
    });
    preparedAnimations.add(idleKey);
  }

  if (!preparedAnimations.has(talkKey)) {
    scene.anims.create({
      key: talkKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: persona.visual.animations.talk.startFrame,
        end: persona.visual.animations.talk.endFrame
      }),
      frameRate: persona.visual.animations.talk.frameRate,
      repeat: persona.visual.animations.talk.loop ? -1 : 0
    });
    preparedAnimations.add(talkKey);
  }

  const walkConfig = persona.visual.animations.walk;
  if (!walkConfig) {
    return undefined;
  }

  const walkKeys: Record<WalkDirection, string> = {
    up: `${textureKey}-walk-up`,
    down: `${textureKey}-walk-down`,
    left: `${textureKey}-walk-left`,
    right: `${textureKey}-walk-right`
  };

  (Object.keys(walkKeys) as WalkDirection[]).forEach((direction) => {
    const animationKey = walkKeys[direction];
    if (preparedAnimations.has(animationKey)) {
      return;
    }

    const config = walkConfig[direction];
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: config.startFrame,
        end: config.endFrame
      }),
      frameRate: config.frameRate,
      repeat: config.loop ? -1 : 0
    });

    preparedAnimations.add(animationKey);
  });

  return walkKeys;
}

function personaTextureKey(persona: PersonaDefinition): string {
  return `${persona.id}-nano-banana`;
}
