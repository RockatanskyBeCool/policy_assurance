ALTER TABLE "public"."policy_requirement"
  ADD COLUMN IF NOT EXISTS "mandatory" boolean NOT NULL DEFAULT false;
