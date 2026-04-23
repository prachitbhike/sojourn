import Phaser from "phaser";

import type { PersonaDefinition } from "@npc-creator/types";

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
  private readonly sprite: Phaser.GameObjects.Sprite;
  private currentState: "idle" | "talk" = "idle";

  constructor(options: NanoBananaRigOptions) {
    this.scene = options.scene;
    this.persona = options.persona;
    this.textureKey = options.textureKey ?? personaTextureKey(this.persona);
    this.idleKey = `${this.textureKey}-idle`;
    this.talkKey = `${this.textureKey}-talk`;

    ensureAnimations(this.scene, this.persona, this.textureKey, this.idleKey, this.talkKey);

    const { frameDimensions } = this.persona.visual;
    const x = options.x ?? frameDimensions.width / 2;
    const y = options.y ?? frameDimensions.height / 2;

    this.sprite = this.scene.add
      .sprite(x, y, this.textureKey)
      .setDepth(options.depth ?? 0)
      .setScale(options.scale ?? 1.6)
      .play(this.idleKey);
  }

  public setTalking(isTalking: boolean): void {
    const targetState: "idle" | "talk" = isTalking ? "talk" : "idle";
    if (targetState === this.currentState) {
      return;
    }

    const nextAnimationKey = targetState === "talk" ? this.talkKey : this.idleKey;
    this.sprite.play(nextAnimationKey, true);
    this.currentState = targetState;
  }

  public destroy(): void {
    this.sprite.destroy();
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
) {
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
}

function personaTextureKey(persona: PersonaDefinition): string {
  return `${persona.id}-nano-banana`;
}
