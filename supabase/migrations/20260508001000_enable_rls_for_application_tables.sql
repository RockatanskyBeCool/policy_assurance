-- Supabase hardening: application tables are owned and written through trusted server-side code.
-- The public Supabase API should not expose policy compliance data until explicit policies exist.

alter table "public"."department_sync_run" enable row level security;
alter table "public"."policy_requirement" enable row level security;
alter table "public"."policy_alias" enable row level security;
alter table "public"."policy_template" enable row level security;
alter table "public"."policy_template_content" enable row level security;
alter table "public"."policy_template_clause" enable row level security;
alter table "public"."policy_review_rule" enable row level security;
alter table "public"."policy_applicability_rule" enable row level security;
alter table "public"."school" enable row level security;
alter table "public"."school_site_profile" enable row level security;
alter table "public"."crawl_run" enable row level security;
alter table "public"."crawl_url_cache" enable row level security;
alter table "public"."page_snapshot" enable row level security;
alter table "public"."page_link" enable row level security;
alter table "public"."discovered_pdf" enable row level security;
alter table "public"."pdf_extraction" enable row level security;
alter table "public"."policy_candidate_match" enable row level security;
alter table "public"."school_policy_inventory" enable row level security;
alter table "public"."evidence_pack" enable row level security;
alter table "public"."compliance_finding" enable row level security;
