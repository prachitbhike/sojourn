import { useEffect, useRef } from "react";
import Phaser from "phaser";

import type { PersonaDefinition } from "@npc-creator/types";
import { NanoBananaRig } from "@npc-creator/phaser-runtime";

interface SpriteStageProps {
  readonly persona: PersonaDefinition;
  readonly spriteUrl: string;
  readonly talking: boolean;
}

export function SpriteStage({ persona, spriteUrl, talking }: SpriteStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<NPCSpriteScene | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const scene = new NPCSpriteScene();
    sceneRef.current = scene;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: persona.visual.frameDimensions.width,
      height: persona.visual.frameDimensions.height,
      backgroundColor: 0x000000,
      transparent: true,
      scene
    });

    return () => {
      sceneRef.current = null;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [persona.visual.frameDimensions.height, persona.visual.frameDimensions.width]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    scene.setPersona(persona, spriteUrl);
  }, [persona, spriteUrl]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    scene.setTalking(talking);
  }, [talking]);

  return <div className="sprite-stage" ref={containerRef} />;
}

class NPCSpriteScene extends Phaser.Scene {
  private rig: NanoBananaRig | null = null;
  private persona: PersonaDefinition | null = null;
  private spriteUrl: string | null = null;

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
    if (this.persona) {
      this.instantiateRig();
    }
  }

  setPersona(persona: PersonaDefinition, spriteUrl: string): void {
    this.persona = persona;
    this.spriteUrl = spriteUrl;

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
    this.rig?.setTalking(isTalking);
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
      x: this.persona.visual.frameDimensions.width / 2,
      y: this.persona.visual.frameDimensions.height / 2,
      scale: 1.6
    });
  }

  private getTextureKey(): string {
    return `${this.persona?.id ?? "persona"}-sprite`;
  }
}
