import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAllPersonas } from "@npc-creator/personas";
import type { PersonaDefinition } from "@npc-creator/types";

import { SpriteStage, type RigDirection } from "./components/SpriteStage";
import { generateSpriteFromPrompt, type GeneratedSprite } from "./services/generation";
import {
  recordLatency,
  readEventsAsJsonl,
  readRecentEvents,
  type InstrumentationEvent
} from "./instrumentation";
import { spriteManifest, spriteMetadataByPersona } from "./spriteManifest";
import "./styles.css";

type ChatRole = "assistant" | "user";
type MessageStatus = "complete" | "pending" | "error";

type MovementAxis = "up" | "down" | "left" | "right";

interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly createdAt: string;
  readonly status: MessageStatus;
}

const INTRO_MESSAGE =
  "Hi! Describe the NPC you'd like—appearance, vibe, props—and I'll push it through the Nano Banana sprite forge.";

const KEY_BINDINGS: Record<string, MovementAxis> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right"
};

export default function App() {
  const personas = useMemo(() => getAllPersonas(), []);
  const defaultPersona = personas[0];
  const defaultSprite = useMemo<GeneratedSprite>(() => buildDefaultSprite(defaultPersona), [defaultPersona]);

  const [messages, setMessages] = useState<ChatMessage[]>([createMessage("assistant", INTRO_MESSAGE)]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisory, setAdvisory] = useState<string | null>(null);
  const [currentSprite, setCurrentSprite] = useState<GeneratedSprite>(defaultSprite);
  const [direction, setDirection] = useState<RigDirection>("idle");
  const [movement, setMovement] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [metrics, setMetrics] = useState<InstrumentationEvent[]>(() =>
    readRecentEvents().slice(-6).reverse()
  );

  const pressedKeys = useRef(new Set<MovementAxis>());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

  const updateMovement = useCallback(() => {
    const next = {
      x: 0,
      y: 0
    };

    if (pressedKeys.current.has("left")) {
      next.x -= 1;
    }
    if (pressedKeys.current.has("right")) {
      next.x += 1;
    }
    if (pressedKeys.current.has("up")) {
      next.y -= 1;
    }
    if (pressedKeys.current.has("down")) {
      next.y += 1;
    }

    const length = Math.hypot(next.x, next.y);
    const normalized = length > 0 ? { x: next.x / length, y: next.y / length } : { x: 0, y: 0 };

    setMovement((prev) =>
      almostEqual(prev.x, normalized.x) && almostEqual(prev.y, normalized.y) ? prev : normalized
    );

    const nextDirection: RigDirection =
      length === 0
        ? "idle"
        : Math.abs(normalized.x) > Math.abs(normalized.y)
          ? normalized.x > 0
            ? "right"
            : "left"
          : normalized.y > 0
            ? "down"
            : "up";

    setDirection((prev) => (prev === nextDirection ? prev : nextDirection));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const axis = KEY_BINDINGS[event.key.toLowerCase()];
      if (!axis) {
        return;
      }
      event.preventDefault();
      if (!pressedKeys.current.has(axis)) {
        pressedKeys.current.add(axis);
        updateMovement();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const axis = KEY_BINDINGS[event.key.toLowerCase()];
      if (!axis) {
        return;
      }
      event.preventDefault();
      if (pressedKeys.current.delete(axis)) {
        updateMovement();
      }
    };

    const handleBlur = () => {
      if (pressedKeys.current.size > 0) {
        pressedKeys.current.clear();
        updateMovement();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [updateMovement]);

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const trimmed = input.trim();
      if (!trimmed || isGenerating) {
        return;
      }

      setIsGenerating(true);
      setError(null);
      setAdvisory(null);

      const userMessage = createMessage("user", trimmed);
      const placeholderId = `assistant-${randomId()}`;
      const placeholder = {
        ...createMessage(
          "assistant",
          "Routing your prompt through the sprite foundry...",
          "pending"
        ),
        id: placeholderId
      };

      setMessages((prev) => [...prev, userMessage, placeholder]);

      const startedAt = performance.now();

      try {
        const result = await generateSpriteFromPrompt(trimmed);
        setCurrentSprite(result);
        setDirection("idle");
        setMovement({ x: 0, y: 0 });
        if (result.advisory) {
          setAdvisory(result.advisory);
        }

        recordLatency({
          kind: "latency",
          label: "sprite-generation",
          durationMs: Math.round(performance.now() - startedAt),
          personaId: result.persona.id,
          turnId: result.requestId
        });

        setMessages((prev) =>
          prev.map((message) =>
            message.id === placeholderId
              ? {
                  ...message,
                  text: buildAssistantResponse(result),
                  status: "complete"
                }
              : message
          )
        );
        setMetrics(readRecentEvents().slice(-6).reverse());
      } catch (generationError) {
        const message =
          generationError instanceof Error
            ? generationError.message
            : "Failed to generate sprite.";
        setError(message);
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === placeholderId
              ? {
                  ...entry,
                  text: message,
                  status: "error"
                }
              : entry
          )
        );
      } finally {
        setInput("");
        setIsGenerating(false);
      }
    },
    [input, isGenerating]
  );

  const handleDownloadMetrics = useCallback(() => {
    const jsonl = readEventsAsJsonl();
    if (!jsonl) {
      return;
    }

    const blob = new Blob([jsonl], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `npc-sprite-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  return (
    <div className="app-container">
      <section className="chat-panel" aria-label="Sprite generation chat">
        <header className="chat-header">
          <h1>NPC Sprite Foundry</h1>
          <p>Describe your NPC and let the pipeline craft a fresh sprite.</p>
        </header>

        <div className="chat-log" ref={chatScrollRef}>
          {messages.map((message) => (
            <article
              key={message.id}
              className={`chat-message chat-message-${message.role} chat-message-${message.status}`}
            >
              <span className="chat-message-role">{message.role === "assistant" ? "Foundry" : "You"}</span>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="E.g. a cosmic botanist with neon vines and a mechanical arm"
            disabled={isGenerating}
            aria-label="Describe the NPC you want"
          />
          <button type="submit" disabled={isGenerating || !input.trim()}>
            {isGenerating ? "Generating..." : "Generate"}
          </button>
        </form>
        <p className="chat-hint">Tip: include mood, outfit details, props, and color palette.</p>
      </section>

      <section className="stage-panel" aria-label="Generated sprite preview">
        <div className="sprite-board">
          <SpriteStage
            persona={currentSprite.persona}
            spriteUrl={currentSprite.spriteUrl}
            talking={isGenerating}
            direction={direction}
            movement={movement}
          />
        </div>

        <div className="sprite-info">
          <h2>{currentSprite.persona.displayName}</h2>
          <p>{currentSprite.persona.summary}</p>

          <dl className="sprite-meta">
            <div>
              <dt>Frame Size</dt>
              <dd>{`${currentSprite.metadata.frameSize.width}×${currentSprite.metadata.frameSize.height}px`}</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{new Date(currentSprite.metadata.generatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Request ID</dt>
              <dd>{currentSprite.requestId}</dd>
            </div>
          </dl>

          <div className="keyboard-hint">Use WASD or arrow keys to move the sprite around the stage.</div>

          {advisory ? (
            <div className="sprite-advisory" role="status">
              {advisory}
            </div>
          ) : null}

          {error ? (
            <div className="sprite-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="metrics-panel" aria-live="polite">
            <div className="metrics-header">
              <h3>Recent Latency</h3>
              <button type="button" onClick={handleDownloadMetrics} disabled={metrics.length === 0}>
                Download JSONL
              </button>
            </div>
            {metrics.length === 0 ? (
              <p className="metrics-empty">No metrics captured yet.</p>
            ) : (
              <ul>
                {metrics.map((event) => (
                  <li key={`${event.kind}-${event.turnId}-${event.timestamp}`}>
                    {event.kind === "latency" ? (
                      <>
                        <strong>{event.label}</strong> {event.durationMs}ms
                      </>
                    ) : (
                      <>
                        <strong>Safety</strong> {event.flagCount} flag(s)
                      </>
                    )}{" "}
                    <span className="metric-timestamp">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function buildDefaultSprite(persona: PersonaDefinition): GeneratedSprite {
  const spriteUrl = spriteManifest[persona.id] ?? persona.visual.spriteSheetPath;
  const metadata = spriteMetadataByPersona[persona.id] ?? persona.visual.metadata;
  if (!metadata) {
    throw new Error(`Missing sprite metadata for persona ${persona.id}.`);
  }

  const personaClone: PersonaDefinition = {
    ...persona,
    visual: {
      ...persona.visual,
      spriteSheetPath: spriteUrl,
      metadata
    }
  };

  return {
    persona: personaClone,
    spriteUrl,
    metadata,
    requestId: "starter-persona",
    prompt: "starter-persona"
  };
}

function createMessage(role: ChatRole, text: string, status: MessageStatus = "complete"): ChatMessage {
  return {
    id: `msg-${randomId()}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    status
  };
}

function buildAssistantResponse(result: GeneratedSprite): string {
  const summary = result.persona.summary?.trim();
  if (summary) {
    return `All set! ${result.persona.displayName}: ${summary}`;
  }
  return `Your new NPC ${result.persona.displayName} is ready.`;
}

function randomId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}
