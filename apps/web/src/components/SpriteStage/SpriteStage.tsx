import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { PoseManifest } from '@sojourn/shared';

export type SpriteStageProps = {
  spriteSheetUrl: string;
  manifest: PoseManifest;
  currentPose: string;
};

export type SpriteStageHandle = {
  setPose: (name: string) => void;
  play: () => void;
  pause: () => void;
};

const STAGE_SIZE = 256;
const SCENE_KEY = 'StageScene';

type PendingPose = { url: string; manifest: PoseManifest; name: string };

class StageScene extends Phaser.Scene {
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private readonly loadedKeys = new Set<string>();
  private pending: PendingPose | null = null;
  private isReady = false;

  constructor() {
    super({ key: SCENE_KEY });
  }

  create() {
    this.isReady = true;
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.applyPose(next);
    }
  }

  requestPose(next: PendingPose) {
    if (!this.isReady) {
      this.pending = next;
      return;
    }
    this.applyPose(next);
  }

  setPose(name: string) {
    if (!this.sprite || !this.anims.exists(name)) return;
    this.sprite.anims.play(name, false);
  }

  resume() {
    const sprite = this.sprite;
    if (!sprite) return;
    if (sprite.anims.isPaused) {
      sprite.anims.resume();
      return;
    }
    const current = sprite.anims.currentAnim;
    if (current) sprite.anims.play(current.key, false);
  }

  pause() {
    this.sprite?.anims.pause();
  }

  private applyPose(next: PendingPose) {
    if (this.loadedKeys.has(next.name)) {
      this.showPose(next);
      return;
    }
    this.load.spritesheet(next.name, next.url, {
      frameWidth: next.manifest.frameWidth,
      frameHeight: next.manifest.frameHeight,
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadedKeys.add(next.name);
      this.ensureAnim(next);
      this.showPose(next);
    });
    this.load.start();
  }

  private ensureAnim(next: PendingPose) {
    if (this.anims.exists(next.name)) return;
    this.anims.create({
      key: next.name,
      frames: this.anims.generateFrameNumbers(next.name, {
        start: 0,
        end: next.manifest.frameCount - 1,
      }),
      frameRate: next.manifest.frameRate,
      repeat: next.manifest.loop ? -1 : 0,
    });
  }

  private showPose(next: PendingPose) {
    const { frameWidth, frameHeight } = next.manifest;
    const longest = Math.max(frameWidth, frameHeight);
    const scale = Math.max(1, Math.floor(STAGE_SIZE / longest));
    if (!this.sprite) {
      this.sprite = this.add.sprite(STAGE_SIZE / 2, STAGE_SIZE / 2, next.name, 0);
    } else {
      this.sprite.setTexture(next.name, 0);
    }
    this.sprite.setScale(scale);
    this.sprite.anims.play(next.name, false);
  }
}

export const SpriteStage = forwardRef<SpriteStageHandle, SpriteStageProps>(
  function SpriteStage({ spriteSheetUrl, manifest, currentPose }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<StageScene | null>(null);

    useLayoutEffect(() => {
      const parent = containerRef.current;
      if (!parent || gameRef.current) return;
      const scene = new StageScene();
      sceneRef.current = scene;
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        pixelArt: true,
        antialias: false,
        backgroundColor: '#1a1a1a',
        scale: { mode: Phaser.Scale.NONE, autoRound: true },
        scene,
      });
      gameRef.current = game;
      return () => {
        game.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      };
    }, []);

    useEffect(() => {
      sceneRef.current?.requestPose({ url: spriteSheetUrl, manifest, name: currentPose });
    }, [spriteSheetUrl, manifest, currentPose]);

    useImperativeHandle(
      ref,
      () => ({
        setPose: (name) => sceneRef.current?.setPose(name),
        play: () => sceneRef.current?.resume(),
        pause: () => sceneRef.current?.pause(),
      }),
      [],
    );

    return (
      <div
        ref={containerRef}
        style={{
          width: STAGE_SIZE,
          height: STAGE_SIZE,
          imageRendering: 'pixelated',
        }}
      />
    );
  },
);
