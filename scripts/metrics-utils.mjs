/**
 * Utilities for parsing and aggregating NPC playground instrumentation metrics.
 *
 * The playground emits JSONL data via the `npc-playground-instrumentation-jsonl`
 * storage key. Each line is a JSON object shaped as either a latency or safety
 * event:
 *   { kind: "latency", label, durationMs, personaId, turnId, timestamp }
 *   { kind: "safety", flagCount, personaId, turnId, timestamp }
 *
 * This module provides helpers to turn that JSONL blob into summary statistics
 * that are easy to surface in automation or reporting pipelines.
 */

const NUMBER_PRECISION = 2;

/**
 * Parse a JSONL string into an array of instrumentation events.
 * Invalid lines are ignored.
 * @param {string} jsonl
 * @returns {Array<Record<string, unknown>>}
 */
export function parseJsonl(jsonl) {
  if (!jsonl) {
    return [];
  }

  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Aggregate latency and safety events into a summary payload.
 * @param {Array<Record<string, unknown>>} events
 * @returns {import('./types').MetricsSummary}
 */
export function aggregateMetrics(events) {
  const normalized = Array.isArray(events) ? events : [];

  const latencyEvents = normalized.filter(
    (event) =>
      event &&
      event.kind === "latency" &&
      isFiniteNumber(event.durationMs) &&
      typeof event.label === "string"
  );

  const safetyEvents = normalized.filter(
    (event) =>
      event &&
      event.kind === "safety" &&
      isFiniteNumber(event.flagCount)
  );

  const timestamps = normalized
    .map((event) => toTimestamp(event?.timestamp))
    .filter((value) => value !== null);

  const latencyDurations = latencyEvents
    .map((event) => Number(event.durationMs))
    .sort((a, b) => a - b);

  const latencyByLabel = rollupBy(latencyEvents, (event) => event.label, (bucket) => {
    const durations = bucket.map((event) => Number(event.durationMs)).sort((a, b) => a - b);
    return {
      count: bucket.length,
      averageMs: average(durations),
      medianMs: quantile(durations, 50),
      p95Ms: quantile(durations, 95),
      minMs: durations.length > 0 ? round(durations[0]) : null,
      maxMs: durations.length > 0 ? round(durations[durations.length - 1]) : null
    };
  });

  const latencyByPersona = rollupBy(
    latencyEvents,
    (event) => event.personaId ?? "unknown",
    (bucket) => {
      const durations = bucket.map((event) => Number(event.durationMs)).sort((a, b) => a - b);
      return {
        count: bucket.length,
        averageMs: average(durations),
        medianMs: quantile(durations, 50),
        p95Ms: quantile(durations, 95)
      };
    }
  );

  const safetyTotals = safetyEvents.reduce(
    (totals, event) => {
      const flagCount = Number(event.flagCount);
      totals.totalFlagCount += flagCount;
      if (flagCount > 0) {
        totals.flaggedTurnCount += 1;
      }
      return totals;
    },
    { totalFlagCount: 0, flaggedTurnCount: 0 }
  );

  const safetyByPersona = rollupBy(
    safetyEvents,
    (event) => event.personaId ?? "unknown",
    (bucket) => {
      const flags = bucket.map((event) => Number(event.flagCount));
      const totalFlagCount = sum(flags);
      return {
        count: bucket.length,
        totalFlagCount: round(totalFlagCount),
        averageFlagCount: average(flags),
        flaggedTurnCount: bucket.filter((event) => Number(event.flagCount) > 0).length
      };
    }
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      events: normalized.length,
      latencyEvents: latencyEvents.length,
      safetyEvents: safetyEvents.length
    },
    window: {
      earliest: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
      latest: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null
    },
    latency: {
      count: latencyEvents.length,
      averageMs: average(latencyDurations),
      medianMs: quantile(latencyDurations, 50),
      p95Ms: quantile(latencyDurations, 95),
      minMs: latencyDurations.length > 0 ? round(latencyDurations[0]) : null,
      maxMs: latencyDurations.length > 0 ? round(latencyDurations[latencyDurations.length - 1]) : null,
      byLabel: latencyByLabel,
      byPersona: latencyByPersona
    },
    safety: {
      count: safetyEvents.length,
      totalFlagCount: round(safetyTotals.totalFlagCount),
      averageFlagCount:
        safetyEvents.length > 0 ? round(safetyTotals.totalFlagCount / safetyEvents.length) : null,
      flaggedTurnCount: safetyTotals.flaggedTurnCount,
      byPersona: safetyByPersona
    }
  };
}

/**
 * Represent a summary payload as formatted text.
 * @param {import('./types').MetricsSummary} summary
 * @returns {string}
 */
export function formatSummary(summary) {
  const sections = [];

  sections.push(
    `Total events: ${summary.totals.events} (latency: ${summary.totals.latencyEvents}, safety: ${summary.totals.safetyEvents})`
  );

  if (summary.window.earliest || summary.window.latest) {
    sections.push(
      `Time window: ${summary.window.earliest ?? "n/a"} → ${summary.window.latest ?? "n/a"}`
    );
  }

  sections.push("");
  sections.push("Latency");
  if (summary.latency.count === 0) {
    sections.push("  No latency events found.");
  } else {
    sections.push(
      `  count: ${summary.latency.count}`,
      `  avg: ${displayNumber(summary.latency.averageMs)} ms, median: ${displayNumber(summary.latency.medianMs)} ms, p95: ${displayNumber(summary.latency.p95Ms)} ms`,
      `  min/max: ${displayNumber(summary.latency.minMs)} ms / ${displayNumber(summary.latency.maxMs)} ms`
    );

    sections.push("  by label:");
    for (const [label, stats] of Object.entries(summary.latency.byLabel).sort()) {
      sections.push(
        `    • ${label}: count ${stats.count}, avg ${displayNumber(stats.averageMs)} ms, p95 ${displayNumber(stats.p95Ms)} ms`
      );
    }

    sections.push("  by persona:");
    for (const [personaId, stats] of Object.entries(summary.latency.byPersona).sort()) {
      sections.push(
        `    • ${personaId}: count ${stats.count}, avg ${displayNumber(stats.averageMs)} ms, p95 ${displayNumber(stats.p95Ms)} ms`
      );
    }
  }

  sections.push("");
  sections.push("Safety");
  if (summary.safety.count === 0) {
    sections.push("  No safety events found.");
  } else {
    sections.push(
      `  count: ${summary.safety.count}`,
      `  total flags: ${displayNumber(summary.safety.totalFlagCount)}, avg flags/event: ${displayNumber(summary.safety.averageFlagCount)}`,
      `  flagged turns: ${summary.safety.flaggedTurnCount}`
    );

    sections.push("  by persona:");
    for (const [personaId, stats] of Object.entries(summary.safety.byPersona).sort()) {
      sections.push(
        `    • ${personaId}: events ${stats.count}, flags ${displayNumber(stats.totalFlagCount)}, avg ${displayNumber(stats.averageFlagCount)}, flagged turns ${stats.flaggedTurnCount}`
      );
    }
  }

  return sections.join("\n");
}

/**
 * @param {Array<number>} values
 * @returns {number | null}
 */
function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return round(sum(values) / values.length);
}

/**
 * @param {Array<number>} values
 * @returns {number}
 */
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Compute the percentile using linear interpolation.
 * @param {Array<number>} sortedValues
 * @param {number} percentile
 * @returns {number | null}
 */
function quantile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }

  const clamped = Math.min(Math.max(percentile, 0), 100);
  const position = ((clamped / 100) * (sortedValues.length - 1));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  if (upperIndex >= sortedValues.length) {
    return round(sortedValues[sortedValues.length - 1]);
  }

  if (lowerIndex === upperIndex) {
    return round(sortedValues[lowerIndex]);
  }

  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];
  const interpolated = lowerValue + weight * (upperValue - lowerValue);
  return round(interpolated);
}

/**
 * Group an array by key and map each bucket.
 * @template T
 * @template V
 * @param {Array<T>} input
 * @param {(item: T) => string} getKey
 * @param {(bucket: Array<T>) => V} mapBucket
 * @returns {Record<string, V>}
 */
function rollupBy(input, getKey, mapBucket) {
  const buckets = new Map();
  for (const item of input) {
    const key = safeKey(getKey(item));
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(item);
  }

  const result = {};
  for (const [key, bucket] of buckets.entries()) {
    result[key] = mapBucket(bucket);
  }
  return result;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * @param {string | undefined | null} key
 * @returns {string}
 */
function safeKey(key) {
  if (typeof key === "string" && key.trim() !== "") {
    return key;
  }
  return "unknown";
}

/**
 * @param {number | null} value
 * @returns {number | null}
 */
function round(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const factor = 10 ** NUMBER_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * @param {number | null} value
 * @returns {string}
 */
function displayNumber(value) {
  return value === null ? "n/a" : value.toFixed(NUMBER_PRECISION);
}

export default {
  parseJsonl,
  aggregateMetrics,
  formatSummary
};
