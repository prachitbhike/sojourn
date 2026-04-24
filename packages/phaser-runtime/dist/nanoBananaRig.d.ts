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
export declare class NanoBananaRig {
    private readonly scene;
    private readonly persona;
    private readonly textureKey;
    private readonly idleKey;
    private readonly talkKey;
    private readonly walkKeys?;
    private readonly sprite;
    private currentDirection;
    private isTalking;
    private currentAnimationKey;
    constructor(options: NanoBananaRigOptions);
    setTalking(isTalking: boolean): void;
    setDirection(direction: RigDirection): void;
    getSprite(): Phaser.GameObjects.Sprite;
    destroy(): void;
    private updateAnimation;
    private resolveAnimationKey;
}
export declare function preloadNanoBananaSpritesheet(scene: Phaser.Scene, persona: PersonaDefinition, textureKey?: string): string;
export {};
