alter table "public"."school"
  add column if not exists "principal" text,
  add column if not exists "council_president" text;
