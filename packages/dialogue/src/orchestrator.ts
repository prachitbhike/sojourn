import {
  type DialogueOrchestratorResult,
  type DialogueRequest,
  type PersonaDefinition,
  type SafetyCategory,
  type SafetyFlag
} from "@npc-creator/types";

export interface DialogueGenerationContext {
  readonly request: DialogueRequest;
  readonly persona: PersonaDefinition;
}

export interface DialogueResponseDraft {
  readonly text: string;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly animation?: "idle" | "talk";
  readonly source?: string;
}

export interface DialogueStreamEvent {
  readonly conversationId: string;
  readonly personaId: string;
  readonly turnId: string;
  readonly index: number;
  readonly value: string;
}

export type DialogueStreamEmitter = (chunk: string) => Promise<void> | void;

export type DialogueStreamChunkHandler = (event: DialogueStreamEvent) => Promise<void> | void;

export interface DialogueGenerator {
  generate(
    context: DialogueGenerationContext,
    emitChunk?: DialogueStreamEmitter
  ): Promise<DialogueResponseDraft | null>;
}

type PersonaLookup = Readonly<Record<string, PersonaDefinition>>;

const cannedResponsesByArchetype: Record<string, readonly string[]> = {
  mentor: [
    "Remember: steady steps beat frantic leaps. What's your next tiny experiment?",
    "I hear your challenge. Let's chart one actionable move together.",
    "Your instincts are sharp; let's give them a compass bearing.",
    "Let's anchor this feeling, then pilot toward the smallest useful change.",
    "Momentum loves clarity. Which piece feels clear enough to tackle first?"
  ],
  trickster: [
    "Oh ho! That's a riddle begging for a reversible cloak. Try flipping it!",
    "Plot twist time: what if you nudge the rules instead of breaking them?",
    "I promise this isn't a trick... probably. Peek from a new angle!",
    "Let’s swap the spotlight: who else could narrate this scene differently?",
    "Slip a surprise into the plan—what happens if you swap cause and effect?"
  ],
  merchant: [
    "Value rings loud when intentions are clear. What's the win-win here?",
    "I can sweeten the deal with context. What matters most to you?",
    "Currencies aren't always coins. Maybe we trade insight for progress?",
    "Show me the hidden lever—what offer unlocks their excitement?",
    "Every trade has a story. How do we make yours impossible to refuse?"
  ]
};

const safetyKeywordCatalogue: ReadonlyArray<{
  readonly keywords: readonly string[];
  readonly category: SafetyCategory;
  readonly severity: SafetyFlag["severity"];
  readonly rationale: string;
}> = [
  {
    keywords: ["kill", "stab", "murder", "suicide"],
    category: "violence",
    severity: "high",
    rationale: "Detected potentially violent or self-harm language."
  },
  {
    keywords: ["hate", "slur", "racist"],
    category: "hate",
    severity: "medium",
    rationale: "Detected potentially hateful language."
  },
  {
    keywords: ["scam", "guaranteed profit", "crypto scheme"],
    category: "financial",
    severity: "medium",
    rationale: "Detected risky financial solicitation language."
  },
  {
    keywords: ["nsfw", "explicit", "adult content"],
    category: "sexual",
    severity: "low",
    rationale: "Detected request for explicit content."
  }
];

export interface DialogueOrchestratorOptions {
  readonly personas: readonly PersonaDefinition[];
  readonly clock?: () => number;
  readonly log?: typeof console.log;
  readonly warn?: typeof console.warn;
  readonly random?: () => number;
  readonly generators?: readonly DialogueGenerator[];
  readonly onStreamChunk?: DialogueStreamChunkHandler;
}

export class DialogueOrchestrator {
  private readonly personaMap: PersonaLookup;
  private readonly clock: () => number;
  private readonly log: typeof console.log;
  private readonly warn: typeof console.warn;
  private readonly random: () => number;
  private readonly generators: readonly DialogueGenerator[];
  private readonly onStreamChunk?: DialogueStreamChunkHandler;

  constructor(options: DialogueOrchestratorOptions) {
    this.personaMap = options.personas.reduce((acc, persona) => {
      acc[persona.id] = persona;
      return acc;
    }, {} as Record<string, PersonaDefinition>);
    this.clock = options.clock ?? (() => Date.now());
    this.log = options.log ?? console.log;
    this.warn = options.warn ?? console.warn;
    this.random = options.random ?? Math.random;
    this.generators = options.generators ?? [];
    this.onStreamChunk = options.onStreamChunk;
  }

  async respond(request: DialogueRequest): Promise<DialogueOrchestratorResult> {
    const start = this.clock();
    const persona = this.personaMap[request.personaId];

    if (!persona) {
      throw new Error(`Persona ${request.personaId} not registered with orchestrator.`);
    }

    const safetyFlags = evaluateSafety(request.user.text);

    if (safetyFlags.length > 0) {
      this.warn(
        `[safety] Conversation ${request.conversationId} turn ${request.turnId} raised flags`,
        safetyFlags
      );
    }

    const context: DialogueGenerationContext = {
      request,
      persona
    };

    let streamIndex = 0;
    let emittedChunkCount = 0;
    const emitStreamChunk: DialogueStreamEmitter = async (value) => {
      if (typeof value !== "string" || value.length === 0) {
        return;
      }

      const event: DialogueStreamEvent = {
        conversationId: request.conversationId,
        personaId: request.personaId,
        turnId: request.turnId,
        index: streamIndex++,
        value
      };

      emittedChunkCount += 1;

      const handler = this.onStreamChunk;
      if (handler) {
        await handler(event);
      }
    };

    const generatorResult = await this.runGenerators(context, emitStreamChunk);
    const usedGenerator = generatorResult !== null;

    const text = usedGenerator
      ? generatorResult.text
      : selectResponse(persona, this.random);

    if (text && emittedChunkCount === 0) {
      await emitStreamChunk(text);
    }

    const latencyMs = Math.max(this.clock() - start, 16);

    const metadata: Record<string, string | number | boolean> = {
      ...(usedGenerator ? generatorResult?.metadata : undefined),
      responseSource: generatorResult?.source ?? (usedGenerator ? "generator" : "canned"),
      canned: generatorResult?.source
        ? generatorResult.source === "canned"
        : !usedGenerator,
      timestamp: new Date().toISOString(),
      streamChunkCount: emittedChunkCount
    };

    const catchphrase = randomCatchphrase(persona, this.random);
    if (catchphrase) {
      metadata.personaCatchphrase = catchphrase;
    }

    const result: DialogueOrchestratorResult = {
      turnId: request.turnId,
      personaId: request.personaId,
      response: {
        text,
        animation: generatorResult?.animation ?? "talk",
        metadata
      },
      safetyFlags,
      latencyMs
    };

    this.log(
      `[dialogue] Persona ${persona.displayName} responded in ${latencyMs}ms`,
      {
        conversationId: request.conversationId,
        turnId: request.turnId,
        safetyFlagCount: safetyFlags.length
      }
    );

    return result;
  }

  private async runGenerators(
    context: DialogueGenerationContext,
    emitChunk: DialogueStreamEmitter
  ): Promise<DialogueResponseDraft | null> {
    for (const generator of this.generators) {
      try {
        const result = await generator.generate(context, emitChunk);
        if (result && typeof result.text === "string" && result.text.trim().length > 0) {
          return result;
        }
      } catch (error) {
        this.warn?.("[dialogue] Generator threw, falling back to canned response.", error);
      }
    }

    return null;
  }
}

function randomCatchphrase(persona: PersonaDefinition, random: () => number): string | undefined {
  if (!persona.catchphrases.length) {
    return undefined;
  }
  const index = Math.floor(random() * persona.catchphrases.length);
  return persona.catchphrases[index];
}

function selectResponse(persona: PersonaDefinition, random: () => number): string {
  const candidates = cannedResponsesByArchetype[persona.archetype];

  if (!candidates || candidates.length === 0) {
    return "I'm still finding my voice, but I'm here to help!";
  }

  const index = Math.floor(random() * candidates.length);
  return candidates[index];
}

function evaluateSafety(input: string): readonly SafetyFlag[] {
  const normalized = input.toLowerCase();

  const matches: SafetyFlag[] = [];

  for (const entry of safetyKeywordCatalogue) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      matches.push({
        category: entry.category,
        severity: entry.severity,
        rationale: entry.rationale
      });
    }
  }

  return matches;
}
