# Playground Metrics CLI

The playground logs lightweight instrumentation events to the browser's Local Storage under the key `npc-playground-instrumentation-jsonl`. Each entry represents either a latency timing or a safety flag count. This CLI turns those events into a quick report that you can eyeball locally or forward to a mock webhook for automated pipelines.

## Exporting the JSONL blob

1. Open the browser's developer tools on the NPC playground.
2. Switch to the **Application > Local Storage** panel and locate the key named `npc-playground-instrumentation-jsonl`.
3. Copy the raw value (it is a JSONL string, one JSON object per line) into a file such as `data/playground-metrics.jsonl`.

## Running the CLI

```bash
pnpm exec node scripts/playground-metrics.mjs data/playground-metrics.jsonl
```

The command prints a human-readable summary, including latency percentiles and safety flag totals broken down by persona.

### Options

- `--json` &mdash; Emit the same summary object as formatted JSON. Handy for saving to a file or piping into other tooling.
- `--post <url>` &mdash; Send the summary payload to a mock HTTP endpoint in addition to printing it locally. Useful for testing downstream integrations.
- `--quiet` &mdash; Skip the textual report (use together with `--json` when you only want structured output).
- `-f, --file <path>` &mdash; Provide the metrics file path explicitly. You can also pass the path as the first positional argument.
- `-h, --help` &mdash; Display the built-in usage guide.

Example posting the summary to a mock endpoint:

```bash
pnpm exec node scripts/playground-metrics.mjs data/playground-metrics.jsonl \
  --post https://example.test/hooks/npc-playground \
  --json > playground-summary.json
```

## Output shape

The CLI emits a `MetricsSummary` object with:

- top-level counts for latency and safety events,
- a time window covering the earliest and latest event timestamps,
- latency statistics (average, median, p95, min/max) grouped by label and persona,
- safety totals grouped by persona, including flagged turn counts.

You can find the TypeScript type definition at `scripts/types.d.ts` if you need to integrate the summary elsewhere.
