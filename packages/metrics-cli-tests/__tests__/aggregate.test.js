import { describe, expect, it } from "vitest";
import { aggregateMetrics, parseJsonl } from "../../../scripts/metrics-utils.mjs";

describe("aggregateMetrics", () => {
  it("computes latency and safety summaries with percentile stats", () => {
    const events = [
      {
        kind: "latency",
        label: "response",
        durationMs: 120,
        personaId: "merchant",
        turnId: "t1",
        timestamp: "2024-01-01T10:00:00.000Z"
      },
      {
        kind: "latency",
        label: "response",
        durationMs: 480,
        personaId: "merchant",
        turnId: "t2",
        timestamp: "2024-01-01T10:00:05.000Z"
      },
      {
        kind: "latency",
        label: "safety-check",
        durationMs: 200,
        personaId: "scout",
        turnId: "t3",
        timestamp: "2024-01-01T10:00:10.000Z"
      },
      {
        kind: "safety",
        personaId: "merchant",
        turnId: "t1",
        flagCount: 0,
        timestamp: "2024-01-01T10:00:00.000Z"
      },
      {
        kind: "safety",
        personaId: "merchant",
        turnId: "t2",
        flagCount: 3,
        timestamp: "2024-01-01T10:00:05.000Z"
      },
      {
        kind: "safety",
        personaId: "scout",
        turnId: "t3",
        flagCount: 1,
        timestamp: "2024-01-01T10:00:10.000Z"
      }
    ];

    const summary = aggregateMetrics(events);

    expect(summary.totals.events).toBe(6);
    expect(summary.latency.count).toBe(3);
    expect(summary.latency.averageMs).toBe(266.67);
    expect(summary.latency.medianMs).toBe(200);
    expect(summary.latency.p95Ms).toBe(452);
    expect(summary.latency.minMs).toBe(120);
    expect(summary.latency.maxMs).toBe(480);

    expect(summary.latency.byLabel.response.count).toBe(2);
    expect(summary.latency.byLabel.response.averageMs).toBe(300);
    expect(summary.latency.byLabel["safety-check"].p95Ms).toBe(200);

    expect(summary.latency.byPersona.merchant.count).toBe(2);
    expect(summary.latency.byPersona.merchant.averageMs).toBe(300);
    expect(summary.latency.byPersona.scout.p95Ms).toBe(200);

    expect(summary.safety.count).toBe(3);
    expect(summary.safety.totalFlagCount).toBe(4);
    expect(summary.safety.averageFlagCount).toBe(1.33);
    expect(summary.safety.flaggedTurnCount).toBe(2);

    expect(summary.safety.byPersona.merchant.totalFlagCount).toBe(3);
    expect(summary.safety.byPersona.merchant.flaggedTurnCount).toBe(1);
    expect(summary.safety.byPersona.scout.averageFlagCount).toBe(1);

    expect(summary.window.earliest).toBe("2024-01-01T10:00:00.000Z");
    expect(summary.window.latest).toBe("2024-01-01T10:00:10.000Z");
  });
});

describe("parseJsonl", () => {
  it("parses valid rows and skips invalid JSON", () => {
    const jsonl = `
{"kind":"latency","durationMs":100,"label":"response","personaId":"merchant","turnId":"t1","timestamp":"2024-01-01T10:00:00.000Z"}
not-json

{"kind":"safety","flagCount":2,"personaId":"merchant","turnId":"t1","timestamp":"2024-01-01T10:00:01.000Z"}
`;

    const events = parseJsonl(jsonl);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "latency",
      durationMs: 100
    });
    expect(events[1]).toMatchObject({
      kind: "safety",
      flagCount: 2
    });
  });
});
