import type { DialogueResponse } from "@npc-creator/types";

export interface CaptionSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface CaptionTrack {
  readonly language: string;
  segments: CaptionSegment[];
  vtt: string;
}

export function generateCaptionTrack(
  response: Pick<DialogueResponse, "text">,
  language = "en-US"
): CaptionTrack {
  const words = response.text.trim().split(/\s+/);
  const segments: CaptionSegment[] = [];

  const averageWordsPerSecond = 2.5;
  const wordsPerSegment = 8;

  let index = 0;
  let currentStart = 0;

  while (index < words.length) {
    const chunk = words.slice(index, index + wordsPerSegment);
    const chunkWordCount = chunk.length;
    const duration = Math.max(1.2, chunkWordCount / averageWordsPerSecond);
    const currentEnd = currentStart + duration;

    segments.push({
      start: currentStart,
      end: currentEnd,
      text: chunk.join(" ")
    });

    index += chunkWordCount;
    currentStart = currentEnd;
  }

  const vtt = buildWebVtt(segments);

  return {
    language,
    segments,
    vtt
  };
}

export function renderCaptionVtt(segments: readonly CaptionSegment[]): string {
  return buildWebVtt(segments);
}

export function createCaptionTrackFromSegments(
  language: string,
  segments: CaptionSegment[]
): CaptionTrack {
  return {
    language,
    segments,
    vtt: renderCaptionVtt(segments)
  };
}

function buildWebVtt(segments: readonly CaptionSegment[]): string {
  const cues = segments
    .map(
      (segment, idx) =>
        `${idx + 1}\n${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}\n${segment.text}\n`
    )
    .join("\n");

  return `WEBVTT\n\n${cues}`.trim();
}

function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((clamped % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(clamped % 60)
    .toString()
    .padStart(2, "0");
  const millis = Math.floor((clamped % 1) * 1000)
    .toString()
    .padStart(3, "0");

  return `${hours}:${minutes}:${secs}.${millis}`;
}
