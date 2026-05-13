import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Database } from "@school-policy/db";
import { schema } from "@school-policy/db";
import { extractPolicyMetadataFromPdf, type ExtractionResult, type PolicyMetadata } from "@school-policy/pdf";

export interface PersistPolicyExtractionResult {
  pdfExtractionId?: string;
  extraction: ExtractionResult;
  structuredJsonUri: string;
  detectedTitle: string | null;
  detectedApprovalDate: string | null;
  detectedNextReviewDate: string | null;
  extractionConfidence: number;
  requiresHumanReview: boolean;
}

export async function extractAndPersistPolicyMetadata(input: {
  db: Database;
  discoveredPdf: typeof schema.discoveredPdfs.$inferSelect;
  storageRoot: string;
}): Promise<PersistPolicyExtractionResult> {
  const extraction = await extractPolicyMetadataFromPdf(input.discoveredPdf.pdfUrl);
  return persistPolicyExtraction({
    ...input,
    extraction
  });
}

export async function persistPolicyExtraction(input: {
  db: Database;
  discoveredPdf: typeof schema.discoveredPdfs.$inferSelect;
  storageRoot: string;
  extraction: ExtractionResult;
}): Promise<PersistPolicyExtractionResult> {
  const finalJson = JSON.parse(await fs.readFile(input.extraction.outputPath, "utf8")) as {
    contentHash: string;
    metadata: PolicyMetadata;
    quality: unknown;
    attempts: unknown;
  };

  const storageUri = path.join("pdf-extractions", input.discoveredPdf.id, input.extraction.jobId, "final.json");
  const structuredJsonPath = path.join(input.storageRoot, storageUri);
  await fs.mkdir(path.dirname(structuredJsonPath), { recursive: true });
  await fs.copyFile(input.extraction.outputPath, structuredJsonPath);

  const detectedDates = buildDetectedDates(finalJson.metadata);
  const [saved] = await input.db
    .insert(schema.pdfExtractions)
    .values({
      discoveredPdfId: input.discoveredPdf.id,
      extractionStatus: "completed",
      extractionMethod: "hybrid",
      structuredJsonUri: storageUri,
      pageCount: pageCountFromDiagnostics(input.extraction.diagnosticsPath),
      detectedTitle: finalJson.metadata.title.value,
      detectedDocumentId: finalJson.metadata.documentId.value,
      detectedStatus: finalJson.metadata.status.value,
      detectedDates,
      detectedReviewDate: isoDate(finalJson.metadata.nextReviewDate.value),
      detectedNextReviewDate: isoDate(finalJson.metadata.nextReviewDate.value),
      detectedApprovalDate: isoDate(finalJson.metadata.approvalDate.value),
      detectedEffectiveDate: isoDate(finalJson.metadata.effectiveDate.value),
      detectedVersion: finalJson.metadata.version.value,
      detectedReviewCycle: finalJson.metadata.reviewCycle.value,
      detectedPolicyOwner: finalJson.metadata.policyOwner.value,
      detectedResponsibleArea: finalJson.metadata.responsibleArea.value,
      detectedApprovers: finalJson.metadata.approvers,
      extractedWarnings: finalJson.metadata.extractedWarnings,
      qualityReport: finalJson.quality,
      extractionProvider: "alibaba-dashscope",
      extractionModel: process.env.QWEN_VL_MODEL ?? "qwen3-vl-32b-instruct",
      sourceContentHash: finalJson.contentHash,
      requiresHumanReview: input.extraction.quality.requiresHumanReview,
      extractionConfidence: input.extraction.quality.overallConfidence.toFixed(3),
      extractedAt: new Date()
    })
    .returning();

  return {
    pdfExtractionId: saved?.id,
    extraction: input.extraction,
    structuredJsonUri: storageUri,
    detectedTitle: finalJson.metadata.title.value,
    detectedApprovalDate: finalJson.metadata.approvalDate.value,
    detectedNextReviewDate: finalJson.metadata.nextReviewDate.value,
    extractionConfidence: input.extraction.quality.overallConfidence,
    requiresHumanReview: input.extraction.quality.requiresHumanReview
  };
}

function buildDetectedDates(metadata: PolicyMetadata): Array<Record<string, unknown>> {
  return [
    ["approvalDate", metadata.approvalDate],
    ["effectiveDate", metadata.effectiveDate],
    ["nextReviewDate", metadata.nextReviewDate]
  ]
    .filter(([, evidence]) => Boolean((evidence as PolicyMetadata["approvalDate"]).value || (evidence as PolicyMetadata["approvalDate"]).sourceText))
    .map(([field, evidence]) => ({
      field,
      value: (evidence as PolicyMetadata["approvalDate"]).value,
      sourceText: (evidence as PolicyMetadata["approvalDate"]).sourceText,
      pageNumber: (evidence as PolicyMetadata["approvalDate"]).pageNumber,
      confidence: (evidence as PolicyMetadata["approvalDate"]).confidence,
      notes: (evidence as PolicyMetadata["approvalDate"]).notes ?? null
    }));
}

function pageCountFromDiagnostics(diagnosticsPath: string): number | undefined {
  try {
    const diagnostics = JSON.parse(readFileSync(diagnosticsPath, "utf8")) as { pageCount?: number };
    return diagnostics.pageCount;
  } catch {
    return undefined;
  }
}

function isoDate(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T00:00:00Z`);
}
