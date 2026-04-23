# Conversational Intelligence Architecture

## Goals
- Translate user speech/text into structured directives controlling NPC dialogue, emotion, and animation.
- Maintain safety, latency, and persona consistency.

## High-Level Flow
1. Capture user input (text or ASR transcript) with timestamps.
2. Send context to Dialogue Orchestrator service.
3. Orchestrator queries LLM with persona prompt and memory state.
4. LLM response parsed into schema `{ text, emotion, intent, animationCue, metadata }`.
5. Response routed to ElevenLabs voice pipeline and Phaser animation controller.
6. Log interaction for analytics and moderation.

## Dialogue Orchestrator Components
- **Persona Profiles**: JSON definitions containing backstory, speech style, taboo topics, emotional ranges.
- **Context Memory**: short-term (current session) + optional long-term (permanent facts) stored in vector DB or key-value store.
- **Guardrails**: content filters pre/post LLM call (OpenAI Safety, custom regex, heuristics); fallback to canned responses on violations.
- **Latency Optimizations**:
  - Use cached responses for common queries.
  - Employ response streaming; start ElevenLabs call once first chunk arrives.
  - Pre-compute persona intros and signature phrases.

## Schema Definition (TypeScript)
```ts
interface DialogueTurn {
  npcId: string;
  userText: string;
  contextId: string;
  response: {
    text: string;
    emotion: 'neutral' | 'joy' | 'anger' | 'sadness' | 'surprise';
    animationCue: string; // e.g., 'emote_joy', 'talk'
    speechRate: number;
    metadata?: Record<string, unknown>;
  };
  safety: {
    flagged: boolean;
    reason?: string;
  };
  timestamps: {
    received: number;
    llmStart: number;
    llmEnd: number;
  };
}
```

## Toolchain
- Primary LLM: TBD (assume GPT-5 turbo or Vertex Gemini 2.5). Wrap with LangChain/LlamaIndex for orchestration.
- Memory store: Redis (fast in-memory) plus Pinecone/Weaviate for embeddings.
- Safety: OpenAI moderation + custom lexical filters; track autop-run logs.

## Monitoring & Analytics
- Capture latency metrics (LLM, ElevenLabs, total round trip) and emotion distribution.
- Store transcripts with hashed user IDs for privacy.
- Expose dashboard (Grafana/Superset) showing health, error spikes, flagged sessions.

## Next Steps
- Finalize persona schema and guardrail policies.
- Prototype orchestrator endpoint returning mocked directives.
- Integrate with audio pipeline to validate schema alignment.
