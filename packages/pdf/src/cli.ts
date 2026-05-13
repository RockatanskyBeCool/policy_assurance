#!/usr/bin/env node
import { extractPolicyMetadataFromPdf } from "./extraction/policy-extraction-pipeline-service.js";

const args = parseArgs(process.argv.slice(2));
const input = args._[0];

if (!input) {
  console.error("Usage: npm run extract -w @school-policy/pdf -- <file-or-url> [--dry-run] [--verbose]");
  process.exit(1);
}

const result = await extractPolicyMetadataFromPdf(input, {
  dataDir: stringArg(args, "data-dir"),
  maxCandidatePages: numberArg(args, "max-candidate-pages"),
  rasterDpi: numberArg(args, "raster-dpi"),
  maxExtractionAttempts: numberArg(args, "max-attempts"),
  model: stringArg(args, "model"),
  dryRun: Boolean(args["dry-run"]),
  verbose: Boolean(args.verbose)
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

console.log(
  JSON.stringify(
    {
      jobId: result.jobId,
      outputPath: result.outputPath,
      diagnosticsPath: result.diagnosticsPath,
      overallConfidence: result.quality.overallConfidence,
      requiresHumanReview: result.quality.requiresHumanReview,
      warnings: result.quality.warnings,
      attempts: result.attempts
    },
    null,
    2
  )
);

function parseArgs(values: string[]): Record<string, string | boolean | string[]> & { _: string[] } {
  const parsed: Record<string, string | boolean | string[]> & { _: string[] } = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = stringArg(args, key);
  return value ? Number(value) : undefined;
}
