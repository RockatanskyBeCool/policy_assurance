ALTER TABLE "pdf_extraction" ADD COLUMN "detected_document_id" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_status" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_next_review_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_effective_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_review_cycle" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_policy_owner" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_responsible_area" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "detected_approvers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "extracted_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "quality_report" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "extraction_provider" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "extraction_model" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "source_content_hash" text;--> statement-breakpoint
ALTER TABLE "pdf_extraction" ADD COLUMN "requires_human_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "pdf_extraction_discovered_pdf_idx" ON "pdf_extraction" USING btree ("discovered_pdf_id");--> statement-breakpoint
CREATE INDEX "pdf_extraction_source_hash_idx" ON "pdf_extraction" USING btree ("source_content_hash");--> statement-breakpoint
