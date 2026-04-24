import type {
  DialogueGenerationContext,
  DialogueGenerator,
  DialogueResponseDraft,
  DialogueStreamEmitter
} from "./orchestrator";

export interface StubStreamingGeneratorOptions {
  readonly chunks?: readonly string[];
  readonly chunkDelayMs?: number;
  readonly metadata?: DialogueResponseDraft["metadata"];
  readonly animation?: DialogueResponseDraft["animation"];
  readonly source?: string;
}

const DEFAULT_CHUNKS: readonly string[] = [
  "Thinking through your idea... ",
  "weaving it into the persona's worldview... ",
  "here's a nudge forward."
];

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });

export class StubStreamingGenerator implements DialogueGenerator {
  private readonly chunks: readonly string[];
  private readonly chunkDelayMs: number;
  private readonly metadata?: DialogueResponseDraft["metadata"];
  private readonly animation?: DialogueResponseDraft["animation"];
  private readonly source?: string;

  constructor(options: StubStreamingGeneratorOptions = {}) {
    this.chunks = options.chunks ?? DEFAULT_CHUNKS;
    this.chunkDelayMs = options.chunkDelayMs ?? 0;
    this.metadata = options.metadata;
    this.animation = options.animation;
    this.source = options.source ?? "stub.streaming";
  }

  async generate(
    context: DialogueGenerationContext,
    emitChunk?: DialogueStreamEmitter
  ): Promise<DialogueResponseDraft | null> {
    if (!this.chunks.length) {
      return null;
    }

    let assembled = "";

    for (const chunk of this.composeChunks(context)) {
      assembled += chunk;
      if (emitChunk) {
        await emitChunk(chunk);
      }
      if (this.chunkDelayMs > 0) {
        await delay(this.chunkDelayMs);
      }
    }

    return {
      text: assembled,
      animation: this.animation ?? "talk",
      metadata: {
        chunkCount: this.chunks.length,
        personaId: context.persona.id,
        requestTurnId: context.request.turnId,
        ...(this.metadata ?? {})
      },
      source: this.source
    };
  }

  private composeChunks(context: DialogueGenerationContext): readonly string[] {
    if (this.chunks !== DEFAULT_CHUNKS) {
      return this.chunks;
    }

    const userText = context.request.user.text;
    const personaName = context.persona.displayName;

    return [
      `Alright, ${personaName} is considering your words: "`,
      `${userText}". `,
      "Here is how we might move ahead together."
    ];
  }
}
