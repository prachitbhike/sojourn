export class NanoBananaRig {
    constructor(options) {
        Object.defineProperty(this, "scene", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persona", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "textureKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "idleKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "talkKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "walkKeys", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sprite", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentDirection", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "idle"
        });
        Object.defineProperty(this, "isTalking", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "currentAnimationKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.scene = options.scene;
        this.persona = options.persona;
        this.textureKey = options.textureKey ?? personaTextureKey(this.persona);
        this.idleKey = `${this.textureKey}-idle`;
        this.talkKey = `${this.textureKey}-talk`;
        this.walkKeys = ensureAnimations(this.scene, this.persona, this.textureKey, this.idleKey, this.talkKey);
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
    setTalking(isTalking) {
        if (this.isTalking === isTalking) {
            return;
        }
        this.isTalking = isTalking;
        this.updateAnimation();
    }
    setDirection(direction) {
        const resolvedDirection = direction === "idle" || !this.walkKeys || !this.walkKeys[direction]
            ? "idle"
            : direction;
        if (this.currentDirection === resolvedDirection) {
            return;
        }
        this.currentDirection = resolvedDirection;
        this.updateAnimation();
    }
    getSprite() {
        return this.sprite;
    }
    destroy() {
        this.sprite.destroy();
    }
    updateAnimation() {
        const nextKey = this.resolveAnimationKey();
        if (nextKey === this.currentAnimationKey) {
            return;
        }
        this.sprite.play(nextKey, true);
        this.currentAnimationKey = nextKey;
    }
    resolveAnimationKey() {
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
const preparedSpriteSheets = new Set();
const preparedAnimations = new Set();
export function preloadNanoBananaSpritesheet(scene, persona, textureKey) {
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
function ensureAnimations(scene, persona, textureKey, idleKey, talkKey) {
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
    const walkKeys = {
        up: `${textureKey}-walk-up`,
        down: `${textureKey}-walk-down`,
        left: `${textureKey}-walk-left`,
        right: `${textureKey}-walk-right`
    };
    Object.keys(walkKeys).forEach((direction) => {
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
function personaTextureKey(persona) {
    return `${persona.id}-nano-banana`;
}
