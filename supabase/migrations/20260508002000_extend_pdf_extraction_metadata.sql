alter table "public"."pdf_extraction"
  add column "detected_document_id" text,
  add column "detected_status" text,
  add column "detected_next_review_date" timestamp with time zone,
  add column "detected_effective_date" timestamp with time zone,
  add column "detected_review_cycle" text,
  add column "detected_policy_owner" text,
  add column "detected_responsible_area" text,
  add column "detected_approvers" jsonb default '[]'::jsonb not null,
  add column "extracted_warnings" jsonb default '[]'::jsonb not null,
  add column "quality_report" jsonb default '{}'::jsonb not null,
  add column "extraction_provider" text,
  add column "extraction_model" text,
  add column "source_content_hash" text,
  add column "requires_human_review" boolean default false not null;

create index "pdf_extraction_discovered_pdf_idx"
  on "public"."pdf_extraction" using btree ("discovered_pdf_id");

create index "pdf_extraction_source_hash_idx"
  on "public"."pdf_extraction" using btree ("source_content_hash");
