# School Policy Compliance Platform

Local MVP scaffold for a TypeScript-first application that discovers public school policy PDFs, builds evidence-backed policy inventories, syncs Department policy/template metadata, and evaluates compliance findings.

## Stack

- TypeScript monorepo with npm workspaces
- Fastify API
- BullMQ worker
- Supabase Postgres via Drizzle ORM
- Redis for background jobs
- Local filesystem object storage under `storage/`
- HTTP-first crawler with cache-aware design and future browser fallback

## Repository Layout

```text
apps/
  api/      Fastify API endpoints
  worker/   BullMQ worker for crawl jobs

packages/
  shared/           shared domain types and validation schemas
  db/               Drizzle schema and database client
  policy-registry/  Department policy API adapter
  crawler/          school site exploration and PDF discovery primitives
  pdf/              PDF text/date extraction helpers
  matching/         policy candidate matching
  rules/            compliance rule evaluation

storage/            local object storage placeholder
supabase/           Supabase local config and SQL migrations
```

## Local Setup

```bash
npm install
cp .env.example .env
supabase start
npm run redis:start
npm run supabase:reset
npm run seed:tecoma
npm run crawl:school -- --school "Tecoma Primary School" --live
npm run dev:api
```

In another terminal:

```bash
npm run dev:worker
```

## MVP Data Stores

- Supabase Postgres stores structured records: Department policy metadata, schools, site profiles, crawl runs, URL cache, page links, PDF metadata, extractions, matches, inventory, findings, and evidence-pack references.
- Local filesystem storage stores bulky immutable evidence: PDFs, page snapshots, extracted text, structured extraction JSON, and evidence packs.
- Redis coordinates asynchronous crawl jobs.

The local filesystem object store can later be swapped for S3, Azure Blob Storage, or Google Cloud Storage by keeping the storage URI conventions stable.

## Supabase Database

The canonical application schema is managed in two places:

- Drizzle source schema: `packages/db/src/schema.ts`
- Supabase migration SQL: `supabase/migrations/20260508000000_initial_policy_platform.sql`

Local Supabase uses:

```text
postgres://postgres:postgres@127.0.0.1:54322/postgres
```

Remote Supabase should be configured by setting `DATABASE_URL` in the deployment environment to the Supabase direct or pooled Postgres connection string. The app only needs standard Postgres connectivity; Supabase Auth, Storage, and Edge Functions can be adopted later without changing the core Drizzle model.

Reset local Supabase Postgres and seed Tecoma:

```bash
npm run db:reset:local
```

Apply Drizzle migrations to the configured `DATABASE_URL`:

```bash
npm run db:migrate
```

## Tecoma Local Test

The local MVP includes a seeded Tecoma Primary School record, a WordPress site profile, and a temporary list of public policy requirements.

Run the Tecoma site check by school name:

```bash
npm run crawl:school -- --school "Tecoma Primary School" --live
```

Useful optional limits:

```bash
npm run crawl:school -- --school "Tecoma Primary School" --live --maxPages 40 --maxPdfs 50 --delayMs 1500
```

The command:

- detects the CMS profile
- discovers WordPress sitemap pages
- checks candidate school pages
- records PDF candidates
- matches candidates against the temporary policy list in memory
- saves page evidence, PDF metadata, match confidence, inventory rows, and findings to Postgres
- writes local evidence artifacts under `storage/schools/{schoolId}/runs/{crawlRunId}/`

## Local Admin URLs

- Supabase Studio: <http://127.0.0.1:54323>
- Supabase API: <http://127.0.0.1:54321>
- Supabase Postgres direct: `127.0.0.1:54322`
- Supabase Inbucket email UI: <http://127.0.0.1:54324>
- Redis: `localhost:6379`
- Redis web admin: <http://localhost:8081>
- Web app, when `npm run dev:web` is running: <http://localhost:3000/>
- API health endpoint, when `npm run dev:api` is running: <http://localhost:3001/health>
- Drizzle Studio, when started with `npm run db:studio`: Drizzle prints the browser URL in the terminal
- Local evidence storage: `storage/`

## Crawler Strategy

The crawler is designed to avoid starting from scratch every run:

- Start initial discovery from homepage, sitemap, known policy pages, and known PDF URLs.
- Prioritise URLs containing policy-related terms.
- Capture link text, surrounding text, page context, and candidate PDF URLs.
- Use URL cache records with ETag, Last-Modified, content hash, and next-check timing.
- Reuse extraction results by PDF content hash.
- Maintain a school policy inventory as the current best-known state.
- Run broad discovery periodically and incremental refreshes more frequently.
