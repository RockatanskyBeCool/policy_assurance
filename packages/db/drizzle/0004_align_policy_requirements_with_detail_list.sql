ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "requirement_for_local_policy" text;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "source_of_requirement" text[];--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "local_policy_template_link" text;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "template_last_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "review_cycle" text;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "approval_requirements" text;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "consultation_requirements" text;--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "required_communication_methods" text[];--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "recommended_communication_methods" text[];--> statement-breakpoint
ALTER TABLE "policy_requirement" ADD COLUMN IF NOT EXISTS "related_pal_policy" text;
