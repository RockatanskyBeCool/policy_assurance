import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const defaultLocalDatabaseUrl = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

const appTables = [
  "department_sync_run",
  "policy_alias",
  "policy_template_content",
  "policy_template_clause",
  "policy_review_rule",
  "policy_applicability_rule",
  "policy_template",
  "school_site_profile",
  "crawl_url_cache",
  "page_link",
  "page_snapshot",
  "pdf_extraction",
  "policy_candidate_match",
  "school_policy_inventory",
  "compliance_finding",
  "evidence_pack",
  "discovered_pdf",
  "crawl_run",
  "school",
  "policy_requirement"
];

const defaultPreservedTables = [
  "policy_requirement",
  "policy_alias",
  "policy_template",
  "policy_template_content",
  "policy_template_clause",
  "policy_review_rule",
  "policy_applicability_rule"
];

const args = parseArgs(process.argv.slice(2));
const databaseUrl = stringArg(args, "database-url") ?? process.env.DATABASE_URL ?? defaultLocalDatabaseUrl;
const explicitlyExcludedTables = stringListArg(args, "exclude");
const preservedTables = [...new Set([...defaultPreservedTables, ...explicitlyExcludedTables])];
const unknownTables = preservedTables.filter((table) => !appTables.includes(table));
const truncateTables = appTables.filter((table) => !preservedTables.includes(table));

if (unknownTables.length > 0) {
  console.error(`Unknown table name in --exclude: ${unknownTables.join(", ")}`);
  console.error(`Known app tables: ${appTables.join(", ")}`);
  process.exit(1);
}

if (args["dry-run"]) {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        databaseUrl: redactDatabaseUrl(databaseUrl),
        truncatedTables: truncateTables,
        preservedTables
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!args.yes) {
  console.error("Refusing to truncate database without --yes.");
  console.error("Run: npm run db:truncate -- --yes");
  process.exit(1);
}

if (!args["allow-non-local"] && !isLocalDatabaseUrl(databaseUrl)) {
  console.error(`Refusing to truncate non-local database URL: ${redactDatabaseUrl(databaseUrl)}`);
  console.error("Pass --allow-non-local only if you are completely sure.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  if (truncateTables.length === 0) {
    console.log(
      JSON.stringify(
        {
          status: "skipped",
          databaseUrl: redactDatabaseUrl(databaseUrl),
          truncatedTables: [],
          preservedTables
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const tableList = truncateTables.map((table) => `"${table}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY`);
  console.log(
    JSON.stringify(
      {
        status: "truncated",
        databaseUrl: redactDatabaseUrl(databaseUrl),
        truncatedTables: truncateTables,
        preservedTables
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

function parseArgs(values: string[]): Record<string, string | boolean | string[]> {
  const parsed: Record<string, string | boolean | string[]> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      appendArg(parsed, key, true);
    } else {
      appendArg(parsed, key, next);
      index += 1;
    }
  }
  return parsed;
}

function appendArg(values: Record<string, string | boolean | string[]>, key: string, value: string | boolean): void {
  const existing = values[key];
  if (existing === undefined) {
    values[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(String(value));
  } else {
    values[key] = [String(existing), String(value)];
  }
}

function stringArg(values: Record<string, string | boolean | string[]>, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

function stringListArg(values: Record<string, string | boolean | string[]>, key: string): string[] {
  const value = values[key];
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return rawValues.flatMap((rawValue) => rawValue.split(",")).map((table) => table.trim()).filter(Boolean);
}

function isLocalDatabaseUrl(value: string): boolean {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function redactDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (url.password) url.password = "REDACTED";
  return url.toString();
}
