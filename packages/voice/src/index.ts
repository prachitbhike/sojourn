export { ElevenLabsClient } from "./elevenLabsClient";
export type {
  ElevenLabsClientOptions,
  SynthesisRequest,
  StreamingSynthesisRequest,
  StreamingTextSource,
  TextSynthesisRequest,
  SynthesisResult
} from "./elevenLabsClient";
export { generateCaptionTrack, createCaptionTrackFromSegments, renderCaptionVtt } from "./captions";
export type { CaptionSegment, CaptionTrack } from "./captions";
