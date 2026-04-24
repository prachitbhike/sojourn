#!/usr/bin/env node
/**
 * CLI for summarising NPC playground instrumentation metrics.
 *
 * Usage:
 *   node scripts/playground-metrics.mjs metrics.jsonl
 *   node scripts/playground-metrics.mjs metrics.jsonl --json
 *   node scripts/playground-metrics.mjs metrics.jsonl --post https://example.com/mock-endpoint
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { aggregateMetrics, formatSummary, parseJsonl } from "./metrics-utils.mjs";

/**
 * @typedef {{ file: string | null; json: boolean; postUrl: string | null; quiet: boolean }} CliArgs
 */

/**
 * @param {Array<string>} argv
 * @returns {CliArgs}
 */
function parseArgs(argv) {
  const args = {
    file: null,
    json: false,
    postUrl: null,
    quiet: false
  };

  const tokens = [...argv];
  while (tokens.length > 0) {
    const token = tokens.shift();

    switch (token) {
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
        break;
      case "-f":
      case "--file":
        args.file = tokens.shift() ?? null;
        break;
      case "--json":
        args.json = true;
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "--post":
        args.postUrl = tokens.shift() ?? null;
        break;
      default:
        if (token && !token.startsWith("-") && !args.file) {
          args.file = token;
        } else if (token) {
          console.warn(`Unknown argument "${token}". Use --help to see available options.`);
        }
    }
  }

  return args;
}

function printUsage() {
  const scriptPath = fileURLToPath(import.meta.url);
  const command = `node ${scriptPath}`;
  const help = `
NPC Playground Metrics CLI

Usage:
  ${command} <metrics.jsonl> [--json] [--post <url>] [--quiet]

Options:
  -f, --file <path>   Explicit path to the JSONL export. Equivalent to passing it as the first argument.
      --json          Output the summary report as prettified JSON.
      --post <url>    POST the summary payload to the provided endpoint after printing it locally.
      --quiet         Suppress the human-readable console summary (useful with --json).
  -h, --help          Show this message.

Examples:
  ${command} data/metrics.jsonl
  ${command} data/metrics.jsonl --json > report.json
  ${command} data/metrics.jsonl --post https://mock.api/metrics-hook
`;
  console.log(help.trimEnd());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error("Error: Missing path to the JSONL metrics file.\n");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const filePath = resolve(process.cwd(), args.file);

  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    console.error(`Error: Unable to read metrics file at ${filePath}.`);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
    return;
  }

  const events = parseJsonl(contents);
  const summary = aggregateMetrics(events);

  if (!args.quiet) {
    console.log(formatSummary(summary));
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  }

  if (args.postUrl) {
    await postSummary(args.postUrl, summary, filePath);
  }
}

/**
 * @param {string} url
 * @param {import('./types').MetricsSummary} summary
 * @param {string} filePath
 */
async function postSummary(url, summary, filePath) {
  const payload = {
    sourceFile: filePath,
    generatedAt: summary.generatedAt,
    summary
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await safeReadBody(response);
      console.warn(
        `Warning: Received ${response.status} ${response.statusText} while posting metrics.`,
        text ? `Body: ${text}` : ""
      );
    } else {
      console.log(`Posted summary to ${url} (status ${response.status}).`);
    }
  } catch (error) {
    console.warn(`Warning: Failed to POST summary to ${url}.`);
    if (error instanceof Error) {
      console.warn(error.message);
    }
  }
}

/**
 * @param {Response} response
 */
async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileUrl(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Unexpected error while generating metrics summary.");
    console.error(error);
    process.exitCode = 1;
  });
}

/**
 * Convert a filesystem path into a file URL.
 * @param {string | undefined} targetPath
 */
function pathToFileUrl(targetPath) {
  if (!targetPath) {
    return new URL("file://");
  }
  let normalized = targetPath;
  if (!targetPath.startsWith("/")) {
    normalized = resolve(process.cwd(), targetPath);
  }
  return new URL(`file://${normalized}`);
}

export default {
  parseArgs,
  printUsage,
  main
};
