import type { ExtractionQualityReport } from "./types.js";
import type { Evidence, PolicyMetadata } from "./schemas.js";

const CRITICAL_FIELDS: Array<keyof Pick<PolicyMetadata, "title" | "version" | "approvalDate" | "nextReviewDate" | "policyOwner">> = [
  "title",
  "version",
  "approvalDate",
  "nextReviewDate",
  "policyOwner"
];

const LABELS: Record<string, string[]> = {
  title: ["policy"],
  version: ["version", "revision"],
  approvalDate: ["approved", "approval", "authorised", "authorized", "endorsed"],
  nextReviewDate: ["next review", "review due", "scheduled review"],
  policyOwner: ["owner", "custodian", "responsible officer"],
  effectiveDate: ["effective", "commencement"],
  status: ["status"]
};

export function buildQualityReport(
  metadata: PolicyMetadata,
  minOverallConfidence: number,
  minCriticalFieldConfidence: number,
  extraWarnings: string[] = []
): ExtractionQualityReport {
  const criticalMissingFields = CRITICAL_FIELDS.filter((field) => !metadata[field].value);
  const lowConfidenceFields = Object.entries(metadata)
    .filter((entry): entry is [string, Evidence] => isEvidence(entry[1]))
    .filter(([field, evidence]) => Boolean(evidence.value) && adjustedFieldConfidence(field, evidence) < minCriticalFieldConfidence)
    .map(([field]) => field);

  const warnings = [...new Set([...metadata.extractedWarnings, ...extraWarnings])];
  const missingPenalty = criticalMissingFields.length * 0.12;
  const overallConfidence = Math.min(1, Math.max(0, deriveOverallConfidence(metadata) - missingPenalty));
  const conflicts = warnings.filter((warning) => /conflict|multiple|before|ambiguous/i.test(warning));
  const approverMissing = metadata.approvers.length === 0;

  return {
    overallConfidence,
    criticalMissingFields,
    lowConfidenceFields,
    conflicts,
    warnings,
    requiresHumanReview:
      overallConfidence < minOverallConfidence ||
      criticalMissingFields.length > 0 ||
      lowConfidenceFields.length > 0 ||
      conflicts.length > 0 ||
      approverMissing
  };
}

function deriveOverallConfidence(metadata: PolicyMetadata): number {
  const fields = Object.entries(metadata)
    .map(([, value]) => value)
    .filter(isEvidence)
    .filter((evidence) => evidence.value);
  if (fields.length === 0) return metadata.overallConfidence;
  const evidenceScore = fields.reduce((sum, evidence) => sum + evidence.confidence + (evidence.pageNumber ? 0.05 : 0) + (evidence.sourceText ? 0.05 : 0), 0) / fields.length;
  return (metadata.overallConfidence + evidenceScore) / 2;
}

function adjustedFieldConfidence(field: string, evidence: Evidence): number {
  let score = evidence.confidence;
  if (evidence.pageNumber) score += 0.05;
  if (evidence.sourceText) score += 0.05;
  const labels = LABELS[field] ?? [];
  if (evidence.sourceText && labels.some((label) => evidence.sourceText?.toLowerCase().includes(label))) {
    score += 0.1;
  }
  return Math.min(score, 1);
}

function isEvidence(value: unknown): value is Evidence {
  return Boolean(value && typeof value === "object" && "confidence" in value && "value" in value);
}
