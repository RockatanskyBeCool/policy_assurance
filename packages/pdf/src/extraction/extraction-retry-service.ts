import path from "node:path";
import { z } from "zod";
import type { ExtractionAttemptSummary, PageImageRef, CandidateSection } from "./types.js";
import { emptyPolicyMetadata, type PolicyMetadata } from "./schemas.js";
import { parseModelJson } from "./json-repair-service.js";
import { validateAndNormalize, validationErrorSummary } from "./validation-service.js";
import { writeJson } from "./file-utils.js";
import type { QwenExtractionService } from "./qwen-extraction-service.js";

export interface ExtractionRetryResult {
  metadata: PolicyMetadata;
  attempts: ExtractionAttemptSummary[];
  warnings: string[];
}

export async function runExtractionAttempts(input: {
  qwen: QwenExtractionService;
  sections: CandidateSection[];
  images: PageImageRef[];
  outputDir: string;
  maxAttempts: number;
  dryRun?: boolean;
}): Promise<ExtractionRetryResult> {
  const attempts: ExtractionAttemptSummary[] = [];
  const warnings: string[] = [];

  if (input.dryRun) {
    warnings.push("Dry run enabled; Qwen extraction was not called");
    attempts.push({ attempt: 1, kind: "standard", success: true, warnings: ["dry run"] });
    return {
      metadata: {
        ...emptyPolicyMetadata(),
        extractedWarnings: warnings
      },
      attempts,
      warnings
    };
  }

  let lastRaw = "";
  let lastValidationError = "";

  for (let attempt = 1; attempt <= Math.max(1, input.maxAttempts); attempt += 1) {
    const kind = attempt === 1 ? "standard" : "repair";
    try {
      const raw = attempt === 1 ? await input.qwen.extract(input.sections, input.images) : await input.qwen.repair(lastRaw, lastValidationError);
      lastRaw = raw;
      const rawOutputPath = path.join(input.outputDir, `extraction-attempt-${attempt}.json`);
      await writeJson(rawOutputPath, { raw });
      const parsed = parseModelJson(raw);
      const validated = validateAndNormalize(parsed);
      attempts.push({ attempt, kind, success: true, warnings: validated.warnings, rawOutputPath });
      return { metadata: validated.metadata, attempts, warnings: validated.warnings };
    } catch (error) {
      const message = error instanceof z.ZodError ? validationErrorSummary(error) : error instanceof Error ? error.message : String(error);
      lastValidationError = message;
      warnings.push(`Attempt ${attempt} failed: ${message}`);
      attempts.push({ attempt, kind, success: false, warnings: [], error: message });
      if (attempt >= input.maxAttempts) break;
    }
  }

  return {
    metadata: {
      ...emptyPolicyMetadata(),
      extractedWarnings: warnings
    },
    attempts,
    warnings
  };
}
