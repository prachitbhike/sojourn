export interface LatencyBucketSummary {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
}

export interface PersonaLatencySummary {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
}

export interface PersonaSafetySummary {
  count: number;
  totalFlagCount: number | null;
  averageFlagCount: number | null;
  flaggedTurnCount: number;
}

export interface MetricsSummary {
  generatedAt: string;
  totals: {
    events: number;
    latencyEvents: number;
    safetyEvents: number;
  };
  window: {
    earliest: string | null;
    latest: string | null;
  };
  latency: {
    count: number;
    averageMs: number | null;
    medianMs: number | null;
    p95Ms: number | null;
    minMs: number | null;
    maxMs: number | null;
    byLabel: Record<string, LatencyBucketSummary>;
    byPersona: Record<string, PersonaLatencySummary>;
  };
  safety: {
    count: number;
    totalFlagCount: number | null;
    averageFlagCount: number | null;
    flaggedTurnCount: number;
    byPersona: Record<string, PersonaSafetySummary>;
  };
}
