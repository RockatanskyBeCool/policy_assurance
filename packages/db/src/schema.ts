import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const policyRiskLevel = pgEnum("policy_risk_level", ["critical", "high", "medium", "low"]);
export const policyStatus = pgEnum("policy_status", ["active", "deprecated", "draft"]);
export const policyVisibility = pgEnum("policy_visibility", ["public", "internal", "public_and_internal"]);
export const crawlType = pgEnum("crawl_type", ["full_discovery", "incremental_refresh", "targeted_policy_check", "manual_recheck"]);
export const crawlStatus = pgEnum("crawl_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const urlType = pgEnum("url_type", ["html", "pdf", "docx", "asset", "external", "unknown"]);
export const cacheStatus = pgEnum("cache_status", ["fresh", "stale", "not_modified", "changed", "failed"]);
export const extractionMethod = pgEnum("extraction_method", ["pdf_text", "ocr", "hybrid", "failed"]);
export const matchStatus = pgEnum("match_status", ["candidate", "accepted", "rejected", "needs_review"]);
export const matchMethod = pgEnum("match_method", [
  "exact_alias",
  "filename_match",
  "link_text_match",
  "template_phrase_match",
  "semantic_match",
  "llm_assisted",
  "manual_override"
]);
export const findingStatus = pgEnum("finding_status", ["open", "in_progress", "challenged", "resolved", "dismissed"]);
export const findingType = pgEnum("finding_type", [
  "missing_public_policy",
  "policy_not_discoverable",
  "broken_policy_link",
  "outdated_review_date",
  "template_version_outdated",
  "mandatory_clause_missing",
  "duplicate_versions_found",
  "low_confidence_match",
  "policy_due_soon",
  "council_endorsement_missing"
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const departmentSyncRuns = pgTable("department_sync_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sourceSystem: text("source_system").notNull().default("department_api"),
  apiVersion: text("api_version"),
  syncStatus: text("sync_status").notNull().default("running"),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsCreated: integer("records_created").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  recordsDeprecated: integer("records_deprecated").notNull().default(0),
  errorSummary: text("error_summary")
});

export const policyRequirements = pgTable("policy_requirement", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentPolicyId: text("department_policy_id").notNull(),
  canonicalName: text("canonical_name").notNull(),
  requirementForLocalPolicy: text("requirement_for_local_policy"),
  sourceOfRequirement: text("source_of_requirement").array(),
  policyCategory: text("policy_category"),
  description: text("description"),
  visibility: policyVisibility("visibility").notNull(),
  appliesToAllSchools: boolean("applies_to_all_schools").notNull().default(true),
  mandatory: boolean("mandatory").notNull().default(false),
  riskLevel: policyRiskLevel("risk_level").notNull().default("medium"),
  responsibleRole: text("responsible_role"),
  councilEndorsementRequired: boolean("council_endorsement_required").notNull().default(false),
  localPolicyTemplateLink: text("local_policy_template_link"),
  templateLastUpdatedAt: timestamp("template_last_updated_at", { withTimezone: true }),
  reviewCycle: text("review_cycle"),
  approvalRequirements: text("approval_requirements"),
  consultationRequirements: text("consultation_requirements"),
  requiredCommunicationMethods: text("required_communication_methods").array(),
  recommendedCommunicationMethods: text("recommended_communication_methods").array(),
  relatedPalPolicy: text("related_pal_policy"),
  activeFrom: timestamp("active_from", { withTimezone: true }),
  activeTo: timestamp("active_to", { withTimezone: true }),
  status: policyStatus("status").notNull().default("active"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  localSyncedAt: timestamp("local_synced_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
}, (table) => ({
  departmentPolicyIdIdx: uniqueIndex("policy_requirement_department_policy_id_idx").on(table.departmentPolicyId),
  nameIdx: index("policy_requirement_name_idx").on(table.canonicalName)
}));

export const policyAliases = pgTable("policy_alias", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  aliasText: text("alias_text").notNull(),
  aliasType: text("alias_type").notNull().default("department"),
  source: text("source").notNull().default("department_api"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("1"),
  ...timestamps
}, (table) => ({
  aliasPolicyIdx: index("policy_alias_policy_idx").on(table.policyRequirementId),
  aliasTextIdx: index("policy_alias_text_idx").on(table.aliasText)
}));

export const policyTemplates = pgTable("policy_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  departmentTemplateId: text("department_template_id").notNull(),
  templateName: text("template_name").notNull(),
  templateVersion: text("template_version").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  status: policyStatus("status").notNull().default("active"),
  sourceUrlOrApiRef: text("source_url_or_api_ref"),
  contentHash: text("content_hash"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  localSyncedAt: timestamp("local_synced_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps
}, (table) => ({
  templateSourceIdx: uniqueIndex("policy_template_source_idx").on(table.departmentTemplateId, table.templateVersion),
  templateRequirementIdx: index("policy_template_requirement_idx").on(table.policyRequirementId)
}));

export const policyTemplateContents = pgTable("policy_template_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyTemplateId: uuid("policy_template_id").notNull().references(() => policyTemplates.id),
  contentStorageUri: text("content_storage_uri"),
  extractedTextStorageUri: text("extracted_text_storage_uri"),
  structuredContentJsonUri: text("structured_content_json_uri"),
  templateFormat: text("template_format"),
  contentHash: text("content_hash"),
  extractionStatus: text("extraction_status").notNull().default("pending"),
  ...timestamps
});

export const policyTemplateClauses = pgTable("policy_template_clause", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyTemplateId: uuid("policy_template_id").notNull().references(() => policyTemplates.id),
  clauseKey: text("clause_key").notNull(),
  heading: text("heading"),
  clauseText: text("clause_text"),
  clauseType: text("clause_type").notNull().default("body"),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  isEditable: boolean("is_editable").notNull().default(true),
  expectedPosition: integer("expected_position"),
  semanticHash: text("semantic_hash"),
  ...timestamps
}, (table) => ({
  clauseTemplateIdx: index("policy_template_clause_template_idx").on(table.policyTemplateId)
}));

export const policyReviewRules = pgTable("policy_review_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  cadenceType: text("cadence_type").notNull().default("fixed_interval"),
  cadenceIntervalMonths: integer("cadence_interval_months"),
  reviewAnchor: text("review_anchor").notNull().default("review_date"),
  gracePeriodDays: integer("grace_period_days").notNull().default(0),
  dueRuleDescription: text("due_rule_description"),
  activeFrom: timestamp("active_from", { withTimezone: true }),
  activeTo: timestamp("active_to", { withTimezone: true }),
  ...timestamps
});

export const policyApplicabilityRules = pgTable("policy_applicability_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  appliesToSchoolType: text("applies_to_school_type"),
  appliesToYearLevels: text("applies_to_year_levels").array(),
  appliesIfFeaturePresent: text("applies_if_feature_present"),
  ruleExpression: jsonb("rule_expression").notNull().default(sql`'{}'::jsonb`),
  explanation: text("explanation"),
  ...timestamps
});

export const schools = pgTable("school", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentSchoolId: text("department_school_id").notNull(),
  schoolNumber: text("school_number"),
  schoolName: text("school_name").notNull(),
  schoolType: text("school_type"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  principal: text("principal"),
  councilPresident: text("council_president"),
  state: text("state"),
  region: text("region"),
  websiteUrl: text("website_url").notNull(),
  canonicalDomain: text("canonical_domain"),
  status: text("status").notNull().default("active"),
  lastSuccessfulCrawlAt: timestamp("last_successful_crawl_at", { withTimezone: true }),
  lastPolicyChangeDetectedAt: timestamp("last_policy_change_detected_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  departmentSchoolIdx: uniqueIndex("school_department_school_id_idx").on(table.departmentSchoolId),
  domainIdx: index("school_domain_idx").on(table.canonicalDomain)
}));

export const schoolSiteProfiles = pgTable("school_site_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  homepageUrl: text("homepage_url").notNull(),
  knownPolicyPageUrl: text("known_policy_page_url"),
  knownDocumentRepositoryUrl: text("known_document_repository_url"),
  cmsType: text("cms_type"),
  sitemapUrl: text("sitemap_url"),
  robotsUrl: text("robots_url"),
  crawlStrategy: text("crawl_strategy").notNull().default("adaptive"),
  crawlDepthLimit: integer("crawl_depth_limit").notNull().default(5),
  knownPolicyPages: text("known_policy_pages").array(),
  knownDocumentPages: text("known_document_pages").array(),
  knownPdfPatterns: text("known_pdf_patterns").array(),
  lastProfiledAt: timestamp("last_profiled_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  schoolSiteProfileSchoolIdx: uniqueIndex("school_site_profile_school_idx").on(table.schoolId)
}));

export const crawlRuns = pgTable("crawl_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  crawlType: crawlType("crawl_type").notNull(),
  crawlStatus: crawlStatus("crawl_status").notNull().default("queued"),
  seedUrls: text("seed_urls").array(),
  pagesVisitedCount: integer("pages_visited_count").notNull().default(0),
  pdfsDiscoveredCount: integer("pdfs_discovered_count").notNull().default(0),
  pdfsDownloadedCount: integer("pdfs_downloaded_count").notNull().default(0),
  errorsCount: integer("errors_count").notNull().default(0),
  cacheHitCount: integer("cache_hit_count").notNull().default(0),
  cacheMissCount: integer("cache_miss_count").notNull().default(0),
  summary: text("summary"),
  ...timestamps
}, (table) => ({
  crawlRunsSchoolIdx: index("crawl_runs_school_idx").on(table.schoolId, table.startedAt)
}));

export const crawlUrlCache = pgTable("crawl_url_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  urlType: urlType("url_type").notNull().default("unknown"),
  httpStatus: integer("http_status"),
  contentType: text("content_type"),
  etag: text("etag"),
  lastModifiedHeader: text("last_modified_header"),
  contentHash: text("content_hash"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextCheckAfter: timestamp("next_check_after", { withTimezone: true }),
  cacheStatus: cacheStatus("cache_status").notNull().default("stale"),
  storageUri: text("storage_uri"),
  ...timestamps
}, (table) => ({
  crawlUrlSchoolUrlIdx: uniqueIndex("crawl_url_school_url_idx").on(table.schoolId, table.normalizedUrl),
  crawlUrlHashIdx: index("crawl_url_hash_idx").on(table.contentHash)
}));

export const pageSnapshots = pgTable("page_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  crawlRunId: uuid("crawl_run_id").notNull().references(() => crawlRuns.id),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  title: text("title"),
  htmlStorageUri: text("html_storage_uri"),
  textStorageUri: text("text_storage_uri"),
  contentHash: text("content_hash"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  httpStatus: integer("http_status"),
  contentType: text("content_type"),
  parentUrl: text("parent_url"),
  crawlDepth: integer("crawl_depth").notNull().default(0),
  ...timestamps
}, (table) => ({
  pageSnapshotSchoolIdx: index("page_snapshot_school_idx").on(table.schoolId, table.normalizedUrl)
}));

export const pageLinks = pgTable("page_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageSnapshotId: uuid("page_snapshot_id").notNull().references(() => pageSnapshots.id),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url").notNull(),
  normalizedTargetUrl: text("normalized_target_url").notNull(),
  linkText: text("link_text"),
  surroundingText: text("surrounding_text"),
  linkType: urlType("link_type").notNull().default("unknown"),
  fileExtension: text("file_extension"),
  isSameDomain: boolean("is_same_domain").notNull().default(true),
  discoveryScore: numeric("discovery_score", { precision: 6, scale: 3 }).notNull().default("0"),
  ...timestamps
}, (table) => ({
  pageLinkTargetIdx: index("page_link_target_idx").on(table.schoolId, table.normalizedTargetUrl)
}));

export const discoveredPdfs = pgTable("discovered_pdf", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  crawlRunId: uuid("crawl_run_id").notNull().references(() => crawlRuns.id),
  sourcePageUrl: text("source_page_url"),
  pdfUrl: text("pdf_url").notNull(),
  normalizedPdfUrl: text("normalized_pdf_url").notNull(),
  filename: text("filename"),
  linkText: text("link_text"),
  surroundingText: text("surrounding_text"),
  httpStatus: integer("http_status"),
  contentType: text("content_type"),
  contentLength: integer("content_length"),
  etag: text("etag"),
  lastModifiedHeader: text("last_modified_header"),
  contentHash: text("content_hash"),
  pdfStorageUri: text("pdf_storage_uri"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
  isCurrentlyAccessible: boolean("is_currently_accessible").notNull().default(true),
  ...timestamps
}, (table) => ({
  discoveredPdfSchoolUrlIdx: index("discovered_pdf_school_url_idx").on(table.schoolId, table.normalizedPdfUrl),
  discoveredPdfHashIdx: index("discovered_pdf_hash_idx").on(table.contentHash)
}));

export const pdfExtractions = pgTable("pdf_extraction", {
  id: uuid("id").primaryKey().defaultRandom(),
  discoveredPdfId: uuid("discovered_pdf_id").notNull().references(() => discoveredPdfs.id),
  extractionStatus: text("extraction_status").notNull().default("pending"),
  extractionMethod: extractionMethod("extraction_method"),
  textStorageUri: text("text_storage_uri"),
  structuredJsonUri: text("structured_json_uri"),
  pageCount: integer("page_count"),
  detectedTitle: text("detected_title"),
  detectedDocumentId: text("detected_document_id"),
  detectedStatus: text("detected_status"),
  detectedDates: jsonb("detected_dates").notNull().default(sql`'[]'::jsonb`),
  detectedReviewDate: timestamp("detected_review_date", { withTimezone: true }),
  detectedNextReviewDate: timestamp("detected_next_review_date", { withTimezone: true }),
  detectedApprovalDate: timestamp("detected_approval_date", { withTimezone: true }),
  detectedEffectiveDate: timestamp("detected_effective_date", { withTimezone: true }),
  detectedEndorsementDate: timestamp("detected_endorsement_date", { withTimezone: true }),
  detectedVersion: text("detected_version"),
  detectedSchoolName: text("detected_school_name"),
  detectedReviewCycle: text("detected_review_cycle"),
  detectedPolicyOwner: text("detected_policy_owner"),
  detectedResponsibleArea: text("detected_responsible_area"),
  detectedApprovers: jsonb("detected_approvers").notNull().default(sql`'[]'::jsonb`),
  extractedWarnings: jsonb("extracted_warnings").notNull().default(sql`'[]'::jsonb`),
  qualityReport: jsonb("quality_report").notNull().default(sql`'{}'::jsonb`),
  extractionProvider: text("extraction_provider"),
  extractionModel: text("extraction_model"),
  sourceContentHash: text("source_content_hash"),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  extractionConfidence: numeric("extraction_confidence", { precision: 4, scale: 3 }),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  ...timestamps
});

export const policyCandidateMatches = pgTable("policy_candidate_match", {
  id: uuid("id").primaryKey().defaultRandom(),
  discoveredPdfId: uuid("discovered_pdf_id").notNull().references(() => discoveredPdfs.id),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  policyTemplateId: uuid("policy_template_id").references(() => policyTemplates.id),
  matchStatus: matchStatus("match_status").notNull().default("candidate"),
  matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }).notNull().default("0"),
  matchMethod: matchMethod("match_method").notNull(),
  evidenceSummary: text("evidence_summary"),
  matchedAlias: text("matched_alias"),
  titleScore: numeric("title_score", { precision: 4, scale: 3 }),
  linkTextScore: numeric("link_text_score", { precision: 4, scale: 3 }),
  contentScore: numeric("content_score", { precision: 4, scale: 3 }),
  templateSimilarityScore: numeric("template_similarity_score", { precision: 4, scale: 3 }),
  dateValidityScore: numeric("date_validity_score", { precision: 4, scale: 3 }),
  reviewedByUserId: uuid("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  matchPdfIdx: index("policy_candidate_match_pdf_idx").on(table.discoveredPdfId),
  matchRequirementIdx: index("policy_candidate_match_requirement_idx").on(table.policyRequirementId)
}));

export const schoolPolicyInventory = pgTable("school_policy_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  currentDiscoveredPdfId: uuid("current_discovered_pdf_id").references(() => discoveredPdfs.id),
  currentMatchId: uuid("current_match_id").references(() => policyCandidateMatches.id),
  inventoryStatus: text("inventory_status").notNull().default("unknown"),
  publicUrl: text("public_url"),
  firstFoundAt: timestamp("first_found_at", { withTimezone: true }),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
  ...timestamps
}, (table) => ({
  inventorySchoolPolicyIdx: uniqueIndex("school_policy_inventory_school_policy_idx").on(table.schoolId, table.policyRequirementId)
}));

export const evidencePacks = pgTable("evidence_pack", {
  id: uuid("id").primaryKey().defaultRandom(),
  storageUri: text("storage_uri"),
  summary: text("summary"),
  evidenceJson: jsonb("evidence_json").notNull().default(sql`'{}'::jsonb`),
  ...timestamps
});

export const complianceFindings = pgTable("compliance_finding", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  policyRequirementId: uuid("policy_requirement_id").notNull().references(() => policyRequirements.id),
  findingType: findingType("finding_type").notNull(),
  severity: policyRiskLevel("severity").notNull().default("medium"),
  status: findingStatus("status").notNull().default("open"),
  evidencePackId: uuid("evidence_pack_id").references(() => evidencePacks.id),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionType: text("resolution_type"),
  assignedRole: text("assigned_role"),
  recommendedAction: text("recommended_action"),
  ...timestamps
}, (table) => ({
  findingSchoolIdx: index("compliance_finding_school_idx").on(table.schoolId, table.status),
  findingPolicyIdx: index("compliance_finding_policy_idx").on(table.policyRequirementId)
}));

export const policyRequirementRelations = relations(policyRequirements, ({ many }) => ({
  aliases: many(policyAliases),
  templates: many(policyTemplates),
  reviewRules: many(policyReviewRules),
  applicabilityRules: many(policyApplicabilityRules)
}));

export const schoolRelations = relations(schools, ({ one, many }) => ({
  siteProfile: one(schoolSiteProfiles),
  crawlRuns: many(crawlRuns),
  discoveredPdfs: many(discoveredPdfs),
  inventory: many(schoolPolicyInventory),
  findings: many(complianceFindings)
}));
