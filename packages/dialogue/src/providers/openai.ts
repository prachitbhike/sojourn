import type { DialogueGenerationContext } from "../orchestrator";

export interface OpenAIConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly organization?: string;
  readonly project?: string;
  readonly temperature: number;
}

export interface LoadOpenAIConfigOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly defaultModel?: string;
  readonly defaultTemperature?: number;
}

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_TEMPERATURE = 0.6;

export function loadOpenAIConfig(
  options: LoadOpenAIConfigOptions = {}
): OpenAIConfig | null {
  const env = options.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const baseUrl = env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = env.OPENAI_RESPONSES_MODEL?.trim() || options.defaultModel || DEFAULT_MODEL;

  const temperature =
    env.OPENAI_TEMPERATURE !== undefined
      ? clampTemperature(Number(env.OPENAI_TEMPERATURE))
      : options.defaultTemperature ?? DEFAULT_TEMPERATURE;

  return {
    apiKey,
    model,
    baseUrl,
    organization: env.OPENAI_ORG_ID?.trim() || undefined,
    project: env.OPENAI_PROJECT_ID?.trim() || undefined,
    temperature
  };
}

function clampTemperature(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_TEMPERATURE;
  }

  return Math.min(Math.max(value, 0), 1);
}

export interface OpenAIResponseStreamEventBase {
  readonly type: string;
}

export interface OpenAIResponseOutputDeltaEvent extends OpenAIResponseStreamEventBase {
  readonly type: "response.output_text.delta";
  readonly delta: string;
}

export interface OpenAIResponseCompletedEvent extends OpenAIResponseStreamEventBase {
  readonly type: "response.completed";
}

export interface OpenAIResponseErrorEvent extends OpenAIResponseStreamEventBase {
  readonly type: "error";
  readonly error: {
    readonly message: string;
  };
}

export type OpenAIResponseStreamEvent =
  | OpenAIResponseOutputDeltaEvent
  | OpenAIResponseCompletedEvent
  | OpenAIResponseErrorEvent;

export interface OpenAIResponsePayload {
  readonly model: string;
  readonly input: ReadonlyArray<OpenAIResponseMessage>;
  readonly temperature: number;
  readonly stream: true;
  readonly max_output_tokens?: number;
}

export interface OpenAIResponseMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export function buildOpenAIRequestPayload(
  config: OpenAIConfig,
  context: DialogueGenerationContext,
  maxOutputTokens?: number
): OpenAIResponsePayload {
  const persona = context.persona;

  const guardrailText = persona.guardrails
    .map((guardrail) => `- ${guardrail.topic}: ${guardrail.instruction}`)
    .join("\n");

  const toneNotes = persona.tone.length
    ? `Tone directives:\n${persona.tone
        .map((note) => `- ${note.mood}: ${note.description}`)
        .join("\n")}\n`
    : "";

  const systemPrompt = [
    `You are ${persona.displayName}, a ${persona.archetype} archetype NPC.`,
    `Summary: ${persona.summary}`,
    toneNotes ? toneNotes : "",
    guardrailText ? `Guardrails:\n${guardrailText}` : "",
    "Respond with concise, personable dialogue that fits the persona while advancing the conversation."
  ]
    .filter(Boolean)
    .join("\n\n");

  const transcript = buildTranscript(context);
  const input: OpenAIResponseMessage[] = [
    { role: "system", content: systemPrompt },
    ...transcript
  ];

  return {
    model: config.model,
    input,
    temperature: config.temperature,
    stream: true,
    ...(typeof maxOutputTokens === "number" ? { max_output_tokens: maxOutputTokens } : {})
  };
}

function buildTranscript(
  context: DialogueGenerationContext
): OpenAIResponseMessage[] {
  const transcript: OpenAIResponseMessage[] = [];

  const contextTurns = context.request.context?.recentTurns ?? [];

  for (const turn of contextTurns) {
    transcript.push({
      role: "user",
      content: turn.userText
    });
    transcript.push({
      role: "assistant",
      content: turn.npcText
    });
  }

  transcript.push({
    role: "user",
    content: context.request.user.text
  });

  return transcript;
}
