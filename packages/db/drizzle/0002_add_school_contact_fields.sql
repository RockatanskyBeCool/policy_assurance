ALTER TABLE "school" ADD COLUMN IF NOT EXISTS "school_number" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN IF NOT EXISTS "state" text;--> statement-breakpoint
UPDATE "school" SET "state" = "region", "region" = NULL WHERE "region" IS NOT NULL AND "state" IS NULL;--> statement-breakpoint
