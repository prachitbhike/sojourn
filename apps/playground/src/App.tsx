import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DialogueOrchestrator } from "@npc-creator/dialogue";
import { getAllPersonas } from "@npc-creator/personas";
import type { PersonaDefinition } from "@npc-creator/types";
import { ElevenLabsClient, type SynthesisResult } from "@npc-creator/voice";

import { SpriteStage } from "./components/SpriteStage";
import { useTranscript } from "./hooks/useTranscript";
import {
  readRecentEvents,
  recordLatency,
  recordSafety,
  readEventsAsJsonl,
  type InstrumentationEvent
} from "./instrumentation";
import { spriteManifest } from "./spriteManifest";

const personas = getAllPersonas();

type RigDirection = "idle" | "up" | "down" | "left" | "right";

const directionOptions: RigDirection[] = ["idle", "up", "down", "left", "right"];

const directionLabels: Record<RigDirection, string> = {
  idle: "Idle",
  up: "Walk Up",
  down: "Walk Down",
  left: "Walk Left",
  right: "Walk Right"
};

const conversationPrefix = "local-playground";

export default function App() {
  const [selectedPersonaId, setSelectedPersonaId] = useState(personas[0]?.id ?? "");
  const conversationId = useMemo(
    () => `${conversationPrefix}-${selectedPersonaId}`,
    [selectedPersonaId]
  );

  const { turns, append, clear } = useTranscript(conversationId);

  const orchestratorRef = useRef<DialogueOrchestrator>();
  if (!orchestratorRef.current) {
    orchestratorRef.current = new DialogueOrchestrator({ personas });
  }

  const voiceClientRef = useRef<ElevenLabsClient>();
  if (!voiceClientRef.current) {
    voiceClientRef.current = new ElevenLabsClient();
  }

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [talking, setTalking] = useState(false);
  const [direction, setDirection] = useState<RigDirection>("idle");
  const [captionTrack, setCaptionTrack] = useState<SynthesisResult["captions"] | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [metrics, setMetrics] = useState<InstrumentationEvent[]>([]);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volumeLevel, setVolumeLevel] = useState(1);
  const [muteNotice, setMuteNotice] = useState<string | null>(null);

  const selectedPersonaData = useMemo(() => {
    const persona = personas.find((entry) => entry.id === selectedPersonaId) ?? personas[0];
    const spriteUrl = spriteManifest[persona.id] ?? persona.visual.spriteSheetPath;

    const resolvedPersona: PersonaDefinition = {
      ...persona,
      visual: {
        ...persona.visual,
        spriteSheetPath: spriteUrl
      }
    };

    return {
      persona: resolvedPersona,
      spriteUrl
    };
  }, [selectedPersonaId]);

  const hasWalkAnimations = Boolean(selectedPersonaData.persona.visual.animations.walk);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => setTalking(true);
    const handleEnded = () => setTalking(false);
    const handleError = () => setTalking(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    setMetrics(readRecentEvents().slice(-6).reverse());
  }, [conversationId]);

  useEffect(() => {
    setCaptionTrack(null);
    setTalking(false);
    setDirection("idle");
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setAudioUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setMuteNotice(null);
  }, [selectedPersonaId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = volumeLevel;
  }, [volumeLevel]);

  const handleDownloadMetrics = useCallback(() => {
    const jsonl = readEventsAsJsonl();
    if (!jsonl) {
      console.info("[metrics] Export requested but no events recorded yet.");
      return;
    }

    const blob = new Blob([jsonl], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `npc-metrics-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }, []);

  const sendMessage = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (isSending || !input.trim()) {
        return;
      }

      setIsSending(true);

      try {
        const persona = selectedPersonaData.persona;
        const orchestrator = orchestratorRef.current!;
        const voiceClient = voiceClientRef.current!;

        const turnId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
        const requestTimestamp = new Date().toISOString();

        const orchestratorStart = performance.now();
        const dialogueResult = await orchestrator.respond({
          conversationId,
          personaId: persona.id,
          turnId,
          user: {
            text: input,
            locale: "en-US",
            timestamp: requestTimestamp
          },
          context: {
            recentTurns: turns.slice(-5).map((turn) => ({
              turnId: turn.id,
              userText: turn.userText,
              npcText: turn.personaText
            }))
          }
        });
        const orchestratorDuration = performance.now() - orchestratorStart;

        recordLatency({
          kind: "latency",
          label: "dialogue.stub",
          durationMs: Math.round(orchestratorDuration),
          personaId: persona.id,
          turnId
        });

        recordSafety({
          kind: "safety",
          personaId: persona.id,
          turnId,
          flagCount: dialogueResult.safetyFlags.length
        });

        append({
          id: turnId,
          personaId: persona.id,
          userText: input,
          personaText: dialogueResult.response.text,
          createdAt: requestTimestamp,
          safetyFlags: dialogueResult.safetyFlags.length
        });

        setMetrics(readRecentEvents().slice(-6).reverse());

        const voiceStart = performance.now();
        const synthesis = await voiceClient.synthesize({
          persona,
          text: dialogueResult.response.text
        });
        const voiceDuration = performance.now() - voiceStart;

        recordLatency({
          kind: "latency",
          label: synthesis.muted ? "voice.muted" : "voice.synthesize",
          durationMs: Math.round(voiceDuration),
          personaId: persona.id,
          turnId
        });

        setCaptionTrack(synthesis.captions);

        if (!synthesis.muted && synthesis.audioStream) {
          const blob = await new Response(synthesis.audioStream).blob();
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          const audio = audioRef.current;
          if (audio) {
            audio.src = url;
            audio.load();
            audio.playbackRate = playbackSpeed;
            audio.volume = volumeLevel;
            void audio.play().catch((error) => {
              console.warn("[audio] Playback start failed.", error);
              setMuteNotice("Playback failed—audio muted locally. See console for details.");
              setTalking(false);
            });
            setMuteNotice(null);
          } else {
            setTalking(false);
          }
        } else {
          setMuteNotice(
            synthesis.error?.message
              ? `Voice muted: ${synthesis.error.message}`
              : "Voice muted fallback active—stream unavailable."
          );
          setAudioUrl((current) => {
            if (current) {
              URL.revokeObjectURL(current);
            }
            return null;
          });
          setTalking(false);
        }

        setMetrics(readRecentEvents().slice(-6).reverse());
        setInput("");
      } catch (error) {
        console.error("[app] Failed to complete turn", error);
        setMuteNotice("Voice unavailable due to unexpected error. Try again shortly.");
        setTalking(false);
      } finally {
        setIsSending(false);
      }
    },
    [
      append,
      audioUrl,
      conversationId,
      input,
      isSending,
      playbackSpeed,
      selectedPersonaData.persona,
      turns,
      volumeLevel
    ]
  );

  return (
    <div className="app-shell">
      <aside className="persona-panel">
        <header>
          <h1>NPC Creator Playground</h1>
          <p>Prototype vertical slice for Nano Banana NPCs.</p>
        </header>

        <section className="persona-selector">
          <h2>Personas</h2>
          <ul>
            {personas.map((persona) => (
              <li key={persona.id}>
                <button
                  className={persona.id === selectedPersonaId ? "selected" : ""}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  type="button"
                >
                  {persona.displayName}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="persona-details">
          <h3>{selectedPersonaData.persona.displayName}</h3>
          <p>{selectedPersonaData.persona.summary}</p>
          <div className="tone">
            <h4>Tone</h4>
            <ul>
              {selectedPersonaData.persona.tone.map((note) => (
                <li key={note.mood}>
                  <strong>{note.mood}</strong>: {note.description}
                </li>
              ))}
            </ul>
          </div>
          <div className="catchphrases">
            <h4>Catchphrases</h4>
            <ul>
              {selectedPersonaData.persona.catchphrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="transcript">
          <div className="transcript-header">
            <h2>Transcript</h2>
            <button type="button" onClick={clear}>
              Clear
            </button>
          </div>
          <ol>
            {turns.map((turn) => (
              <li key={turn.id}>
                <p className="user-entry">
                  <span>You</span>: {turn.userText}
                </p>
                <p className="npc-entry">
                  <span>{selectedPersonaData.persona.displayName}</span>: {turn.personaText}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <main className="stage">
        <div className="sprite-wrapper">
          <SpriteStage
            persona={selectedPersonaData.persona}
            spriteUrl={selectedPersonaData.spriteUrl}
            talking={talking}
            direction={direction}
          />
          {captionTrack && captionsEnabled ? (
            <div className="captions">
              {captionTrack.segments.map((segment, idx) => (
                <p key={idx}>{segment.text}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="animation-controls">
          <h3>Animation Preview</h3>
          <div className="direction-buttons">
            {directionOptions.map((option) => {
              const disabled = option !== "idle" && !hasWalkAnimations;
              return (
                <button
                  key={option}
                  type="button"
                  className={option === direction ? "selected" : ""}
                  disabled={disabled}
                  onClick={() => setDirection(option)}
                >
                  {directionLabels[option]}
                </button>
              );
            })}
          </div>
          {!hasWalkAnimations ? (
            <p className="animation-controls-hint">Walk animations unavailable for this persona.</p>
          ) : null}
        </div>

        <div className="caption-toggle">
          <label>
            <input
              type="checkbox"
              checked={captionsEnabled}
              onChange={(event) => setCaptionsEnabled(event.target.checked)}
            />
            Show captions
          </label>
        </div>

        <div className="audio-controls">
          <label>
            Playback speed
            <select
              value={playbackSpeed}
              onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            >
              <option value="0.75">0.75×</option>
              <option value="1">1.00×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.50×</option>
            </select>
          </label>

          <label>
            Volume
            <div className="volume-control">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumeLevel}
                onChange={(event) => setVolumeLevel(Number(event.target.value))}
              />
              <span aria-live="polite">{Math.round(volumeLevel * 100)}%</span>
            </div>
          </label>
        </div>

        {muteNotice ? (
          <div className="mute-indicator" role="status" aria-live="assertive">
            {muteNotice}
          </div>
        ) : null}

        <form className="input-area" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Say hello..."
            disabled={isSending}
            aria-label="Message the NPC"
          />
          <button type="submit" disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>

        <section className="metrics-panel" aria-live="polite">
          <div className="metrics-header">
            <h3>Recent Metrics</h3>
            <button
              type="button"
              onClick={handleDownloadMetrics}
              disabled={metrics.length === 0}
            >
              Download JSONL
            </button>
          </div>
          {metrics.length === 0 ? (
            <p className="metrics-empty">No metrics captured yet.</p>
          ) : (
            <ul>
              {metrics.map((event) => (
                <li key={`${event.kind}-${event.turnId}-${event.timestamp}`}>
                  <strong>{event.kind === "latency" ? event.label : "safety"}</strong>{" "}
                  {event.kind === "latency"
                    ? `${event.durationMs}ms`
                    : `${event.flagCount} flag(s)`}{" "}
                  <span className="metric-timestamp">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <audio ref={audioRef} autoPlay={false} controls={false} />
      </main>
    </div>
  );
}
