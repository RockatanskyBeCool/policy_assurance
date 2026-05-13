alter table "public"."school"
  add column if not exists "school_number" text,
  add column if not exists "address" text,
  add column if not exists "email" text,
  add column if not exists "phone" text,
  add column if not exists "state" text;

update "public"."school"
set "state" = "region",
    "region" = null
where "region" is not null
  and "state" is null;
