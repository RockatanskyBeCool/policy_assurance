import type { z } from "zod";
import { PolicyMetadataSchema, type Evidence, type PolicyMetadata } from "./schemas.js";
import { normalizeDate } from "./date-utils.js";

const dateFields = ["approvalDate", "effectiveDate", "nextReviewDate"] as const;

export interface ValidationResult {
  metadata: PolicyMetadata;
  warnings: string[];
}

export function validateAndNormalize(value: unknown): ValidationResult {
  const coerced = normalizeEmptyStrings(value);
  const parsed = PolicyMetadataSchema.parse(coerced);
  const warnings = [...parsed.extractedWarnings];

  for (const field of dateFields) {
    const evidence = parsed[field];
    const normalized = normalizeDate(evidence.value);
    if (normalized.warning) {
      warnings.push(`${field}: ${normalized.warning}`);
    }
    parsed[field] = {
      ...evidence,
      value: normalized.value,
      notes: normalized.warning ? appendNote(evidence.notes ?? null, normalized.warning) : evidence.notes
    };
  }

  parsed.approvers = dedupeApprovers(parsed.approvers);
  parsed.extractedWarnings = [...new Set(warnings)];

  const chronologyWarnings = chronologyChecks(parsed);
  parsed.extractedWarnings = [...new Set([...parsed.extractedWarnings, ...chronologyWarnings])];
  return { metadata: parsed, warnings: parsed.extractedWarnings };
}

export function validationErrorSummary(error: unknown): string {
  const zodError = error as z.ZodError | undefined;
  if (zodError?.issues) {
    return zodError.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeEmptyStrings(value: unknown): unknown {
  if (value === "") return null;
  if (Array.isArray(value)) return value.map(normalizeEmptyStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeEmptyStrings(nested)]));
  }
  return value;
}

function appendNote(existing: string | null, note: string): string {
  return existing ? `${existing} ${note}` : note;
}

function dedupeApprovers(approvers: PolicyMetadata["approvers"]): PolicyMetadata["approvers"] {
  const seen = new Set<string>();
  return approvers.filter((approver) => {
    const key = `${approver.name ?? ""}|${approver.role ?? ""}|${approver.evidence?.sourceText ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chronologyChecks(metadata: PolicyMetadata): string[] {
  const warnings: string[] = [];
  const approval = dateValue(metadata.approvalDate);
  const effective = dateValue(metadata.effectiveDate);
  const nextReview = dateValue(metadata.nextReviewDate);
  if (approval && nextReview && nextReview < approval) {
    warnings.push("nextReviewDate is before approvalDate");
  }
  if (approval && effective && effective < approval) {
    warnings.push("effectiveDate predates approvalDate; confirm whether retrospective effect is intended");
  }
  return warnings;
}

function dateValue(evidence: Evidence): Date | undefined {
  if (!evidence.value) return undefined;
  const value = new Date(`${evidence.value}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}
