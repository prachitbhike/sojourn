import { useEffect, useRef } from "react";
import Phaser from "phaser";

import type { PersonaDefinition } from "@npc-creator/types";
import { NanoBananaRig } from "@npc-creator/phaser-runtime";

export type RigDirection = "idle" | "up" | "down" | "left" | "right";

interface SpriteStageProps {
  readonly persona: PersonaDefinition;
  readonly spriteUrl: string;
  readonly talking: boolean;
  readonly direction: RigDirection;
  readonly movement: { readonly x: number; readonly y: number };
}

const STAGE_WIDTH = 384;
const STAGE_HEIGHT = 384;
const MOVEMENT_SPEED = 140; // pixels per second
const BOUNDS_PADDING = 48;

export function SpriteStage({ persona, spriteUrl, talking, direction, movement }: SpriteStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<NPCSpriteScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const scene = new NPCSpriteScene();
    sceneRef.current = scene;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      backgroundColor: 0x0f172a,
      transparent: true,
      scene
    });

    return () => {
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setPersona(persona, spriteUrl);
  }, [persona, spriteUrl]);

  useEffect(() => {
    sceneRef.current?.setTalking(talking);
  }, [talking]);

  useEffect(() => {
    sceneRef.current?.setDirection(direction);
  }, [direction]);

  useEffect(() => {
    sceneRef.current?.setMovement(movement);
  }, [movement]);

  return <div className="sprite-stage" ref={containerRef} />;
}

class NPCSpriteScene extends Phaser.Scene {
  private rig: NanoBananaRig | null = null;
  private persona: PersonaDefinition | null = null;
  private spriteUrl: string | null = null;
  private direction: RigDirection = "idle";
  private talking = false;
  private readonly velocity = new Phaser.Math.Vector2(0, 0);
  private readonly bounds = new Phaser.Geom.Rectangle(
    BOUNDS_PADDING,
    BOUNDS_PADDING,
    STAGE_WIDTH - BOUNDS_PADDING * 2,
    STAGE_HEIGHT - BOUNDS_PADDING * 2
  );
  private halfWidth = 0;
  private halfHeight = 0;

  preload(): void {
    if (!this.persona || !this.spriteUrl) {
      return;
    }

    const textureKey = this.getTextureKey();
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }

    this.load.spritesheet(textureKey, this.spriteUrl, {
      frameWidth: this.persona.visual.frameDimensions.width,
      frameHeight: this.persona.visual.frameDimensions.height
    });
  }

  create(): void {
    this.add
      .rectangle(STAGE_WIDTH / 2, STAGE_HEIGHT / 2, STAGE_WIDTH, STAGE_HEIGHT, 0x111a2b, 0.55)
      .setStrokeStyle(2, 0x334155, 0.9);

    if (this.persona) {
      this.instantiateRig();
    }
  }

  update(_: number, delta: number): void {
    if (!this.rig || this.velocity.lengthSq() === 0) {
      return;
    }

    const sprite = this.rig.getSprite();
    const deltaSeconds = delta / 1000;
    const distance = MOVEMENT_SPEED * deltaSeconds;

    sprite.x += this.velocity.x * distance;
    sprite.y += this.velocity.y * distance;

    const minX = this.bounds.left + this.halfWidth;
    const maxX = this.bounds.right - this.halfWidth;
    const minY = this.bounds.top + this.halfHeight;
    const maxY = this.bounds.bottom - this.halfHeight;

    sprite.x = Phaser.Math.Clamp(sprite.x, minX, maxX);
    sprite.y = Phaser.Math.Clamp(sprite.y, minY, maxY);
  }

  setPersona(persona: PersonaDefinition, spriteUrl: string): void {
    this.persona = persona;
    this.spriteUrl = spriteUrl;
    this.halfWidth = persona.visual.frameDimensions.width / 2;
    this.halfHeight = persona.visual.frameDimensions.height / 2;

    if (!this.scene.isActive()) {
      return;
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.instantiateRig();
    });
    this.preload();
    this.load.start();
  }

  setTalking(isTalking: boolean): void {
    this.talking = isTalking;
    this.rig?.setTalking(isTalking);
  }

  setDirection(direction: RigDirection): void {
    this.direction = direction;
    this.rig?.setDirection(direction);
  }

  setMovement(movement: { readonly x: number; readonly y: number }): void {
    this.velocity.set(movement.x, movement.y);
  }

  private instantiateRig(): void {
    if (!this.persona) {
      return;
    }

    this.rig?.destroy();

    this.rig = new NanoBananaRig({
      scene: this,
      persona: this.persona,
      textureKey: this.getTextureKey(),
      x: STAGE_WIDTH / 2,
      y: STAGE_HEIGHT / 2,
      scale: 1.6
    });

    this.rig.setDirection(this.direction);
    this.rig.setTalking(this.talking);
  }

  private getTextureKey(): string {
    return `${this.persona?.id ?? "persona"}-sprite`;
  }
}
