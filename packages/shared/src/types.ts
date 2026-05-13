export type PolicyRiskLevel = "critical" | "high" | "medium" | "low";

export type PolicyRequirementStatus = "active" | "deprecated" | "draft";

export type PolicyVisibility = "public" | "internal" | "public_and_internal";

export type CrawlType = "full_discovery" | "incremental_refresh" | "targeted_policy_check" | "manual_recheck";

export type CrawlStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type UrlType = "html" | "pdf" | "docx" | "asset" | "external" | "unknown";

export type CacheStatus = "fresh" | "stale" | "not_modified" | "changed" | "failed";

export type PdfExtractionMethod = "pdf_text" | "ocr" | "hybrid" | "failed";

export type MatchMethod =
  | "exact_alias"
  | "filename_match"
  | "link_text_match"
  | "template_phrase_match"
  | "semantic_match"
  | "llm_assisted"
  | "manual_override";

export type MatchStatus = "candidate" | "accepted" | "rejected" | "needs_review";

export type ComplianceFindingType =
  | "missing_public_policy"
  | "policy_not_discoverable"
  | "broken_policy_link"
  | "outdated_review_date"
  | "template_version_outdated"
  | "mandatory_clause_missing"
  | "duplicate_versions_found"
  | "low_confidence_match"
  | "policy_due_soon"
  | "council_endorsement_missing";

export type FindingStatus = "open" | "in_progress" | "challenged" | "resolved" | "dismissed";

export interface DepartmentPolicyRecord {
  departmentPolicyId: string;
  canonicalName: string;
  requirementForLocalPolicy?: string;
  sourceOfRequirement?: string[];
  description?: string;
  category?: string;
  visibility: PolicyVisibility;
  riskLevel: PolicyRiskLevel;
  councilEndorsementRequired: boolean;
  localPolicyTemplateLink?: string;
  templateLastUpdatedAt?: string;
  reviewCycle?: string;
  approvalRequirements?: string;
  consultationRequirements?: string;
  requiredCommunicationMethods?: string[];
  recommendedCommunicationMethods?: string[];
  relatedPalPolicy?: string;
  aliases: string[];
  reviewCadenceMonths?: number;
  template?: DepartmentTemplateRecord;
  sourceUpdatedAt?: string;
}

export interface DepartmentTemplateRecord {
  departmentTemplateId: string;
  templateName: string;
  templateVersion: string;
  effectiveFrom?: string;
  sourceUrlOrApiRef?: string;
  contentHash?: string;
}

export interface CrawlSeed {
  schoolId: string;
  url: string;
  reason: "homepage" | "sitemap" | "known_policy_page" | "known_pdf" | "manual";
  priority: number;
}

export interface CandidatePdf {
  url: string;
  sourcePageUrl: string;
  linkText?: string;
  surroundingText?: string;
  filename?: string;
  discoveryScore: number;
}
