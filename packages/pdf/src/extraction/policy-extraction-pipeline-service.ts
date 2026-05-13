import path from "node:path";
import { CliDoclingService } from "./docling-service.js";
import { detectCandidateSections } from "./candidate-detection-service.js";
import { rasterizePages } from "./pdf-raster-service.js";
import { QwenExtractionService } from "./qwen-extraction-service.js";
import { env, resolvedDataDir } from "./env.js";
import { ingestPdf, writeJson } from "./file-utils.js";
import { buildQualityReport } from "./confidence-service.js";
import { runExtractionAttempts } from "./extraction-retry-service.js";
import type { ExtractionResult, PolicyExtractionOptions } from "./types.js";

export async function extractPolicyMetadataFromPdf(inputPdfPathOrUrl: string, options: PolicyExtractionOptions = {}): Promise<ExtractionResult> {
  const dataDir = resolvedDataDir(options.dataDir);
  const maxCandidatePages = options.maxCandidatePages ?? env.MAX_CANDIDATE_PAGES;
  const rasterDpi = options.rasterDpi ?? env.RASTER_DPI;
  const maxExtractionAttempts = options.maxExtractionAttempts ?? env.MAX_EXTRACTION_ATTEMPTS;
  const minOverallConfidence = options.minOverallConfidence ?? env.MIN_OVERALL_CONFIDENCE;
  const minCriticalFieldConfidence = options.minCriticalFieldConfidence ?? env.MIN_CRITICAL_FIELD_CONFIDENCE;

  const ingested = await ingestPdf(inputPdfPathOrUrl, dataDir, env.MAX_UPLOAD_MB);
  const parseDir = path.join(ingested.jobDir, "parse");
  const imagesDir = path.join(ingested.jobDir, "pages");
  const docling = new CliDoclingService();
  const parsedDocument = await docling.parsePdf(ingested.localPdfPath, parseDir);
  const candidates = detectCandidateSections(parsedDocument, maxCandidatePages);
  await writeJson(path.join(ingested.jobDir, "candidate_pages.json"), candidates);

  const raster = await rasterizePages(
    ingested.localPdfPath,
    candidates.map((candidate) => candidate.pageNumber),
    imagesDir,
    rasterDpi
  );

  const qwen = new QwenExtractionService({
    apiKey: env.ALIBABA_API_KEY,
    baseUrl: env.ALIBABA_BASE_URL,
    model: options.model ?? env.QWEN_VL_MODEL
  });
  if (!options.dryRun && !qwen.configured) {
    throw new Error("ALIBABA_API_KEY is required. Re-run with --dry-run to validate parsing without model extraction.");
  }

  const extraction = await runExtractionAttempts({
    qwen,
    sections: candidates,
    images: raster.images,
    outputDir: ingested.jobDir,
    maxAttempts: maxExtractionAttempts,
    dryRun: options.dryRun
  });

  const quality = buildQualityReport(extraction.metadata, minOverallConfidence, minCriticalFieldConfidence, extraction.warnings);
  const finalPath = path.join(ingested.jobDir, "final.json");
  const diagnosticsPath = path.join(ingested.jobDir, "diagnostics.json");

  await writeJson(finalPath, {
    jobId: ingested.jobId,
    originalFilename: ingested.originalFilename,
    contentHash: ingested.contentHash,
    metadata: extraction.metadata,
    quality,
    attempts: extraction.attempts
  });
  await writeJson(diagnosticsPath, {
    jobId: ingested.jobId,
    createdAt: ingested.createdAt,
    source: inputPdfPathOrUrl,
    localPdfPath: ingested.localPdfPath,
    parser: parsedDocument.diagnostics,
    pageCount: parsedDocument.pageCount,
    candidatePages: candidates.map((candidate) => ({
      pageNumber: candidate.pageNumber,
      score: candidate.score,
      reason: candidate.reason
    })),
    raster: raster.diagnostics,
    qwen: {
      configured: qwen.configured,
      model: options.model ?? env.QWEN_VL_MODEL,
      baseUrl: env.ALIBABA_BASE_URL
    },
    warnings: quality.warnings
  });

  return {
    jobId: ingested.jobId,
    metadata: extraction.metadata,
    quality,
    attempts: extraction.attempts,
    outputPath: finalPath,
    diagnosticsPath
  };
}
