export type PersonaArchetype = "mentor" | "trickster" | "merchant";
export interface PersonaToneNote {
    readonly mood: string;
    readonly description: string;
}
export interface PersonaGuardrail {
    readonly topic: string;
    readonly instruction: string;
}
export interface PersonaVoiceProfile {
    readonly provider: "elevenlabs";
    readonly voiceId: string;
    readonly defaultStyle?: string;
    readonly captionLocale: string;
}
export interface SpriteAnimationConfig {
    readonly startFrame: number;
    readonly endFrame: number;
    readonly frameRate: number;
    readonly loop: boolean;
}
export interface SpriteAnimationMetadata extends SpriteAnimationConfig {
    readonly frameCount: number;
}
export interface SpriteLightingMetadata {
    readonly primaryAngleDegrees: number;
    readonly technique: string;
    readonly notes?: string;
}
export interface SpriteSheetMetadata {
    readonly personaId: string;
    readonly texture: string;
    readonly frameSize: {
        readonly width: number;
        readonly height: number;
    };
    readonly animations: Record<string, SpriteAnimationMetadata>;
    readonly lighting: SpriteLightingMetadata;
    readonly generatedAt: string;
}
export interface PersonaWalkAnimationSet {
    readonly up: SpriteAnimationConfig;
    readonly down: SpriteAnimationConfig;
    readonly left: SpriteAnimationConfig;
    readonly right: SpriteAnimationConfig;
}
export interface PersonaVisualProfile {
    readonly spriteSheetPath: string;
    readonly frameDimensions: {
        readonly width: number;
        readonly height: number;
    };
    readonly animations: {
        readonly idle: SpriteAnimationConfig;
        readonly talk: SpriteAnimationConfig;
        readonly walk?: PersonaWalkAnimationSet;
    };
    readonly metadata?: SpriteSheetMetadata;
}
export interface PersonaDefinition {
    readonly id: string;
    readonly displayName: string;
    readonly archetype: PersonaArchetype;
    readonly summary: string;
    readonly tone: PersonaToneNote[];
    readonly guardrails: PersonaGuardrail[];
    readonly catchphrases: readonly string[];
    readonly voice: PersonaVoiceProfile;
    readonly visual: PersonaVisualProfile;
}
export interface DialogueMessage {
    readonly text: string;
    readonly locale: string;
    readonly timestamp: string;
}
export interface DialogueRequest {
    readonly conversationId: string;
    readonly personaId: string;
    readonly turnId: string;
    readonly user: DialogueMessage;
    readonly context?: DialogueContext;
}
export interface DialogueContext {
    readonly recentTurns: readonly DialogueTurnSummary[];
    readonly sessionVariables?: Record<string, string>;
}
export interface DialogueTurnSummary {
    readonly turnId: string;
    readonly userText: string;
    readonly npcText: string;
}
export type SafetyCategory = "self-harm" | "violence" | "hate" | "sexual" | "medical" | "financial" | "other";
export interface SafetyFlag {
    readonly category: SafetyCategory;
    readonly severity: "low" | "medium" | "high";
    readonly rationale: string;
}
export interface DialogueOrchestratorResult {
    readonly turnId: string;
    readonly personaId: string;
    readonly response: DialogueResponse;
    readonly safetyFlags: readonly SafetyFlag[];
    readonly latencyMs: number;
}
export interface DialogueResponse {
    readonly text: string;
    readonly audio?: {
        readonly streamUrl?: string;
        readonly durationMs?: number;
    };
    readonly animation: "idle" | "talk";
    readonly metadata?: Record<string, string | number | boolean>;
}
export interface LatencyProbe {
    readonly label: string;
    readonly durationMs: number;
}
export interface DialogueInstrumentationEvent {
    readonly turnId: string;
    readonly conversationId: string;
    readonly personaId: string;
    readonly probes: readonly LatencyProbe[];
    readonly safetyFlags: readonly SafetyFlag[];
    readonly createdAt: string;
}
export interface AccessibilityChecklistItem {
    readonly id: string;
    readonly description: string;
    readonly status: "todo" | "in-progress" | "done";
    readonly notes?: string;
}
