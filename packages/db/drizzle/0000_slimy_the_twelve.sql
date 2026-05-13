CREATE TYPE "public"."cache_status" AS ENUM('fresh', 'stale', 'not_modified', 'changed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crawl_type" AS ENUM('full_discovery', 'incremental_refresh', 'targeted_policy_check', 'manual_recheck');--> statement-breakpoint
CREATE TYPE "public"."extraction_method" AS ENUM('pdf_text', 'ocr', 'hybrid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'in_progress', 'challenged', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."finding_type" AS ENUM('missing_public_policy', 'policy_not_discoverable', 'broken_policy_link', 'outdated_review_date', 'template_version_outdated', 'mandatory_clause_missing', 'duplicate_versions_found', 'low_confidence_match', 'policy_due_soon', 'council_endorsement_missing');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('exact_alias', 'filename_match', 'link_text_match', 'template_phrase_match', 'semantic_match', 'llm_assisted', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('candidate', 'accepted', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."policy_risk_level" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('active', 'deprecated', 'draft');--> statement-breakpoint
CREATE TYPE "public"."policy_visibility" AS ENUM('public', 'internal', 'public_and_internal');--> statement-breakpoint
CREATE TYPE "public"."url_type" AS ENUM('html', 'pdf', 'docx', 'asset', 'external', 'unknown');--> statement-breakpoint
CREATE TABLE "compliance_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"finding_type" "finding_type" NOT NULL,
	"severity" "policy_risk_level" DEFAULT 'medium' NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"evidence_pack_id" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_type" text,
	"assigned_role" text,
	"recommended_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"crawl_type" "crawl_type" NOT NULL,
	"crawl_status" "crawl_status" DEFAULT 'queued' NOT NULL,
	"seed_urls" text[],
	"pages_visited_count" integer DEFAULT 0 NOT NULL,
	"pdfs_discovered_count" integer DEFAULT 0 NOT NULL,
	"pdfs_downloaded_count" integer DEFAULT 0 NOT NULL,
	"errors_count" integer DEFAULT 0 NOT NULL,
	"cache_hit_count" integer DEFAULT 0 NOT NULL,
	"cache_miss_count" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_url_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"url_type" "url_type" DEFAULT 'unknown' NOT NULL,
	"http_status" integer,
	"content_type" text,
	"etag" text,
	"last_modified_header" text,
	"content_hash" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_check_after" timestamp with time zone,
	"cache_status" "cache_status" DEFAULT 'stale' NOT NULL,
	"storage_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"source_system" text DEFAULT 'department_api' NOT NULL,
	"api_version" text,
	"sync_status" text DEFAULT 'running' NOT NULL,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_deprecated" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "discovered_pdf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"source_page_url" text,
	"pdf_url" text NOT NULL,
	"normalized_pdf_url" text NOT NULL,
	"filename" text,
	"link_text" text,
	"surrounding_text" text,
	"http_status" integer,
	"content_type" text,
	"content_length" integer,
	"etag" text,
	"last_modified_header" text,
	"content_hash" text,
	"pdf_storage_uri" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_downloaded_at" timestamp with time zone,
	"is_currently_accessible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_uri" text,
	"summary" text,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_snapshot_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"normalized_target_url" text NOT NULL,
	"link_text" text,
	"surrounding_text" text,
	"link_type" "url_type" DEFAULT 'unknown' NOT NULL,
	"file_extension" text,
	"is_same_domain" boolean DEFAULT true NOT NULL,
	"discovery_score" numeric(6, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"title" text,
	"html_storage_uri" text,
	"text_storage_uri" text,
	"content_hash" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"content_type" text,
	"parent_url" text,
	"crawl_depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discovered_pdf_id" uuid NOT NULL,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"extraction_method" "extraction_method",
	"text_storage_uri" text,
	"structured_json_uri" text,
	"page_count" integer,
	"detected_title" text,
	"detected_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_review_date" timestamp with time zone,
	"detected_approval_date" timestamp with time zone,
	"detected_endorsement_date" timestamp with time zone,
	"detected_version" text,
	"detected_school_name" text,
	"extraction_confidence" numeric(4, 3),
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_type" text DEFAULT 'department' NOT NULL,
	"source" text DEFAULT 'department_api' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_applicability_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"applies_to_school_type" text,
	"applies_to_year_levels" text[],
	"applies_if_feature_present" text,
	"rule_expression" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_candidate_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discovered_pdf_id" uuid NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"policy_template_id" uuid,
	"match_status" "match_status" DEFAULT 'candidate' NOT NULL,
	"match_confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"match_method" "match_method" NOT NULL,
	"evidence_summary" text,
	"matched_alias" text,
	"title_score" numeric(4, 3),
	"link_text_score" numeric(4, 3),
	"content_score" numeric(4, 3),
	"template_similarity_score" numeric(4, 3),
	"date_validity_score" numeric(4, 3),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_policy_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"policy_category" text,
	"description" text,
	"visibility" "policy_visibility" NOT NULL,
	"applies_to_all_schools" boolean DEFAULT true NOT NULL,
	"risk_level" "policy_risk_level" DEFAULT 'medium' NOT NULL,
	"responsible_role" text,
	"council_endorsement_required" boolean DEFAULT false NOT NULL,
	"active_from" timestamp with time zone,
	"active_to" timestamp with time zone,
	"status" "policy_status" DEFAULT 'active' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"local_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_review_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"cadence_type" text DEFAULT 'fixed_interval' NOT NULL,
	"cadence_interval_months" integer,
	"review_anchor" text DEFAULT 'review_date' NOT NULL,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"due_rule_description" text,
	"active_from" timestamp with time zone,
	"active_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_template_clause" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_template_id" uuid NOT NULL,
	"clause_key" text NOT NULL,
	"heading" text,
	"clause_text" text,
	"clause_type" text DEFAULT 'body' NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"expected_position" integer,
	"semantic_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_template_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_template_id" uuid NOT NULL,
	"content_storage_uri" text,
	"extracted_text_storage_uri" text,
	"structured_content_json_uri" text,
	"template_format" text,
	"content_hash" text,
	"extraction_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"department_template_id" text NOT NULL,
	"template_name" text NOT NULL,
	"template_version" text NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"status" "policy_status" DEFAULT 'active' NOT NULL,
	"source_url_or_api_ref" text,
	"content_hash" text,
	"source_updated_at" timestamp with time zone,
	"local_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_policy_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"policy_requirement_id" uuid NOT NULL,
	"current_discovered_pdf_id" uuid,
	"current_match_id" uuid,
	"inventory_status" text DEFAULT 'unknown' NOT NULL,
	"public_url" text,
	"first_found_at" timestamp with time zone,
	"last_confirmed_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_site_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"homepage_url" text NOT NULL,
	"known_policy_page_url" text,
	"known_document_repository_url" text,
	"cms_type" text,
	"sitemap_url" text,
	"robots_url" text,
	"crawl_strategy" text DEFAULT 'adaptive' NOT NULL,
	"crawl_depth_limit" integer DEFAULT 5 NOT NULL,
	"known_policy_pages" text[],
	"known_document_pages" text[],
	"known_pdf_patterns" text[],
	"last_profiled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_school_id" text NOT NULL,
	"school_name" text NOT NULL,
	"school_type" text,
	"region" text,
	"website_url" text NOT NULL,
	"canonical_domain" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_successful_crawl_at" timestamp with time zone,
	"last_policy_change_detected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_finding" ADD CONSTRAINT "compliance_finding_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_finding" ADD CONSTRAINT "compliance_finding_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_finding" ADD CONSTRAINT "compliance_finding_evidence_pack_id_evidence_pack_id_fk" FOREIGN KEY ("evidence_pack_id") REFERENCES "public"."evidence_pack"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD CONSTRAINT "crawl_run_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_url_cache" ADD CONSTRAINT "crawl_url_cache_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_pdf" ADD CONSTRAINT "discovered_pdf_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_pdf" ADD CONSTRAINT "discovered_pdf_crawl_run_id_crawl_run_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_link" ADD CONSTRAINT "page_link_page_snapshot_id_page_snapshot_id_fk" FOREIGN KEY ("page_snapshot_id") REFERENCES "public"."page_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_link" ADD CONSTRAINT "page_link_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_snapshot" ADD CONSTRAINT "page_snapshot_crawl_run_id_crawl_run_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_snapshot" ADD CONSTRAINT "page_snapshot_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD CONSTRAINT "pdf_extraction_discovered_pdf_id_discovered_pdf_id_fk" FOREIGN KEY ("discovered_pdf_id") REFERENCES "public"."discovered_pdf"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_alias" ADD CONSTRAINT "policy_alias_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_applicability_rule" ADD CONSTRAINT "policy_applicability_rule_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_candidate_match" ADD CONSTRAINT "policy_candidate_match_discovered_pdf_id_discovered_pdf_id_fk" FOREIGN KEY ("discovered_pdf_id") REFERENCES "public"."discovered_pdf"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_candidate_match" ADD CONSTRAINT "policy_candidate_match_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_candidate_match" ADD CONSTRAINT "policy_candidate_match_policy_template_id_policy_template_id_fk" FOREIGN KEY ("policy_template_id") REFERENCES "public"."policy_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_review_rule" ADD CONSTRAINT "policy_review_rule_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_template_clause" ADD CONSTRAINT "policy_template_clause_policy_template_id_policy_template_id_fk" FOREIGN KEY ("policy_template_id") REFERENCES "public"."policy_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_template_content" ADD CONSTRAINT "policy_template_content_policy_template_id_policy_template_id_fk" FOREIGN KEY ("policy_template_id") REFERENCES "public"."policy_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_template" ADD CONSTRAINT "policy_template_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_policy_inventory" ADD CONSTRAINT "school_policy_inventory_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_policy_inventory" ADD CONSTRAINT "school_policy_inventory_policy_requirement_id_policy_requirement_id_fk" FOREIGN KEY ("policy_requirement_id") REFERENCES "public"."policy_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_policy_inventory" ADD CONSTRAINT "school_policy_inventory_current_discovered_pdf_id_discovered_pdf_id_fk" FOREIGN KEY ("current_discovered_pdf_id") REFERENCES "public"."discovered_pdf"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_policy_inventory" ADD CONSTRAINT "school_policy_inventory_current_match_id_policy_candidate_match_id_fk" FOREIGN KEY ("current_match_id") REFERENCES "public"."policy_candidate_match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_site_profile" ADD CONSTRAINT "school_site_profile_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_finding_school_idx" ON "compliance_finding" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "compliance_finding_policy_idx" ON "compliance_finding" USING btree ("policy_requirement_id");--> statement-breakpoint
CREATE INDEX "crawl_runs_school_idx" ON "crawl_run" USING btree ("school_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_url_school_url_idx" ON "crawl_url_cache" USING btree ("school_id","normalized_url");--> statement-breakpoint
CREATE INDEX "crawl_url_hash_idx" ON "crawl_url_cache" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "discovered_pdf_school_url_idx" ON "discovered_pdf" USING btree ("school_id","normalized_pdf_url");--> statement-breakpoint
CREATE INDEX "discovered_pdf_hash_idx" ON "discovered_pdf" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "page_link_target_idx" ON "page_link" USING btree ("school_id","normalized_target_url");--> statement-breakpoint
CREATE INDEX "page_snapshot_school_idx" ON "page_snapshot" USING btree ("school_id","normalized_url");--> statement-breakpoint
CREATE INDEX "policy_alias_policy_idx" ON "policy_alias" USING btree ("policy_requirement_id");--> statement-breakpoint
CREATE INDEX "policy_alias_text_idx" ON "policy_alias" USING btree ("alias_text");--> statement-breakpoint
CREATE INDEX "policy_candidate_match_pdf_idx" ON "policy_candidate_match" USING btree ("discovered_pdf_id");--> statement-breakpoint
CREATE INDEX "policy_candidate_match_requirement_idx" ON "policy_candidate_match" USING btree ("policy_requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_requirement_department_policy_id_idx" ON "policy_requirement" USING btree ("department_policy_id");--> statement-breakpoint
CREATE INDEX "policy_requirement_name_idx" ON "policy_requirement" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "policy_template_clause_template_idx" ON "policy_template_clause" USING btree ("policy_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_template_source_idx" ON "policy_template" USING btree ("department_template_id","template_version");--> statement-breakpoint
CREATE INDEX "policy_template_requirement_idx" ON "policy_template" USING btree ("policy_requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_policy_inventory_school_policy_idx" ON "school_policy_inventory" USING btree ("school_id","policy_requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_site_profile_school_idx" ON "school_site_profile" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_department_school_id_idx" ON "school" USING btree ("department_school_id");--> statement-breakpoint
CREATE INDEX "school_domain_idx" ON "school" USING btree ("canonical_domain");