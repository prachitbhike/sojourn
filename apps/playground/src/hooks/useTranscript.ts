import { useCallback, useEffect, useState } from "react";

export interface TranscriptTurn {
  readonly id: string;
  readonly personaId: string;
  readonly userText: string;
  readonly personaText: string;
  readonly createdAt: string;
  readonly safetyFlags: number;
}

const STORAGE_KEY_PREFIX = "npc-playground-transcript:";

export function useTranscript(conversationId: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${conversationId}`;
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setTurns([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as TranscriptTurn[];
      setTurns(parsed);
    } catch (error) {
      console.warn("[transcript] Failed to parse stored transcript, resetting.", error);
      setTurns([]);
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: TranscriptTurn[]) => {
      setTurns(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey]
  );

  const append = useCallback(
    (turn: TranscriptTurn) => {
      persist([...turns, turn]);
    },
    [persist, turns]
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { turns, append, clear };
}
