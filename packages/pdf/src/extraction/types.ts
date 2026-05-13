import type { PolicyMetadata } from "./schemas.js";

export interface ParsedDocument {
  sourceFile: string;
  pageCount: number;
  pages: ParsedPage[];
  fullText: string;
  tables: ParsedTable[];
  metadata?: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  markdown?: string;
  tables?: ParsedTable[];
  images?: PageImageRef[];
}

export interface ParsedTable {
  pageNumber: number;
  caption?: string;
  rows: string[][];
  markdown: string;
}

export interface PageImageRef {
  pageNumber: number;
  path: string;
  mimeType: "image/png" | "image/jpeg";
}

export interface CandidateSection {
  pageNumber: number;
  reason: string;
  text: string;
  markdown?: string;
  tables?: ParsedTable[];
  score: number;
}

export interface ExtractionAttemptSummary {
  attempt: number;
  kind: "standard" | "repair" | "focused" | "expanded";
  success: boolean;
  warnings: string[];
  rawOutputPath?: string;
  error?: string;
}

export interface ExtractionQualityReport {
  overallConfidence: number;
  criticalMissingFields: string[];
  lowConfidenceFields: string[];
  conflicts: string[];
  warnings: string[];
  requiresHumanReview: boolean;
}

export interface ExtractionResult {
  jobId: string;
  metadata: PolicyMetadata;
  quality: ExtractionQualityReport;
  attempts: ExtractionAttemptSummary[];
  outputPath: string;
  diagnosticsPath: string;
}

export interface PolicyExtractionOptions {
  dataDir?: string;
  maxCandidatePages?: number;
  rasterDpi?: number;
  minOverallConfidence?: number;
  minCriticalFieldConfidence?: number;
  maxExtractionAttempts?: number;
  model?: string;
  dryRun?: boolean;
  verbose?: boolean;
}
