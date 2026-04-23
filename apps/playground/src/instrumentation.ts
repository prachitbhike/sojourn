export type InstrumentationEvent =
  | {
      readonly kind: "latency";
      readonly label: string;
      readonly durationMs: number;
      readonly personaId: string;
      readonly turnId: string;
      readonly timestamp: string;
    }
  | {
      readonly kind: "safety";
      readonly personaId: string;
      readonly turnId: string;
      readonly flagCount: number;
      readonly timestamp: string;
    };

const STORAGE_KEY = "npc-playground-instrumentation";
const JSONL_STORAGE_KEY = "npc-playground-instrumentation-jsonl";
const MAX_EVENTS = 50;

export function recordLatency(
  event: Omit<Extract<InstrumentationEvent, { kind: "latency" }>, "timestamp">
): void {
  const payload: InstrumentationEvent = {
    ...event,
    timestamp: new Date().toISOString()
  };
  persistEvent(payload);
  console.info("[metrics] latency", payload);
}

export function recordSafety(
  event: Omit<Extract<InstrumentationEvent, { kind: "safety" }>, "timestamp">
): void {
  const payload: InstrumentationEvent = {
    ...event,
    timestamp: new Date().toISOString()
  };
  persistEvent(payload);
  console.info("[metrics] safety", payload);
}

export function readRecentEvents(): InstrumentationEvent[] {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as InstrumentationEvent[];
  } catch (error) {
    console.warn("[metrics] Failed to parse instrumentation storage.", error);
    return [];
  }
}

export function readEventsAsJsonl(): string {
  return readStorage(JSONL_STORAGE_KEY) ?? "";
}

function persistEvent(event: InstrumentationEvent): void {
  const events = readRecentEvents();
  events.push(event);
  const trimmed = events.slice(-MAX_EVENTS);
  writeStorage(STORAGE_KEY, JSON.stringify(trimmed));
  persistJsonl(trimmed);
}

function persistJsonl(events: InstrumentationEvent[]): void {
  if (events.length === 0) {
    writeStorage(JSONL_STORAGE_KEY, "");
    return;
  }

  const jsonl = events.map((entry) => JSON.stringify(entry)).join("\n");
  writeStorage(JSONL_STORAGE_KEY, jsonl);
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[metrics] Unable to read storage for key ${key}.`, error);
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[metrics] Unable to persist storage for key ${key}.`, error);
  }
}
