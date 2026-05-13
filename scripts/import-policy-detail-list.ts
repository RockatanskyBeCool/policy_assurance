import "dotenv/config";
import fs from "node:fs/promises";
import pg from "pg";
import { defaultLocalDatabaseUrl } from "@school-policy/db";

const { Pool } = pg;

interface PolicyDetailRow {
  localPolicyTopic: string;
  requirementForLocalPolicy: string | null;
  sourceOfRequirement: string[];
  localPolicyTemplateLink: string | null;
  templateLastUpdatedAt: string | null;
  reviewCycle: string | null;
  approvalRequirements: string | null;
  consultationRequirements: string | null;
  requiredCommunicationMethods: string[];
  recommendedCommunicationMethods: string[];
  relatedPalPolicy: string | null;
}

const args = parseArgs(process.argv.slice(2));
const inputPath = stringArg(args, "input");
const databaseUrl = stringArg(args, "database-url") ?? process.env.DATABASE_URL ?? defaultLocalDatabaseUrl;

if (!inputPath) {
  console.error("Usage: tsx scripts/import-policy-detail-list.ts --input /path/to/policy-detail-list.json");
  process.exit(1);
}

const rows = JSON.parse(await fs.readFile(inputPath, "utf8")) as PolicyDetailRow[];
const pool = new Pool({ connectionString: databaseUrl });

try {
  await assertRequiredColumnsExist(pool);

  let inserted = 0;
  let updated = 0;
  let aliasesInserted = 0;

  for (const [index, row] of rows.entries()) {
    const canonicalName = cleanText(row.localPolicyTopic);
    if (!canonicalName) continue;

    const departmentPolicyId = `LOCAL-${slugify(canonicalName)}`;
    const approvalRequirements = cleanText(row.approvalRequirements);
    const requirementForLocalPolicy = cleanText(row.requirementForLocalPolicy);
    const templateLink = cleanText(row.localPolicyTemplateLink);
    const sourceOfRequirement = cleanList(row.sourceOfRequirement);
    const requiredCommunicationMethods = cleanList(row.requiredCommunicationMethods);
    const recommendedCommunicationMethods = cleanList(row.recommendedCommunicationMethods);

    const upsertResult = await pool.query<{ id: string; inserted: boolean }>(
      `
        INSERT INTO policy_requirement (
          department_policy_id,
          canonical_name,
          requirement_for_local_policy,
          source_of_requirement,
          policy_category,
          description,
          visibility,
          applies_to_all_schools,
          risk_level,
          responsible_role,
          council_endorsement_required,
          local_policy_template_link,
          template_last_updated_at,
          review_cycle,
          approval_requirements,
          consultation_requirements,
          required_communication_methods,
          recommended_communication_methods,
          related_pal_policy,
          status,
          source_updated_at,
          local_synced_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          'active', $20, now(), now()
        )
        ON CONFLICT (department_policy_id)
        DO UPDATE SET
          canonical_name = excluded.canonical_name,
          requirement_for_local_policy = excluded.requirement_for_local_policy,
          source_of_requirement = excluded.source_of_requirement,
          policy_category = excluded.policy_category,
          description = excluded.description,
          visibility = excluded.visibility,
          applies_to_all_schools = excluded.applies_to_all_schools,
          risk_level = excluded.risk_level,
          responsible_role = excluded.responsible_role,
          council_endorsement_required = excluded.council_endorsement_required,
          local_policy_template_link = excluded.local_policy_template_link,
          template_last_updated_at = excluded.template_last_updated_at,
          review_cycle = excluded.review_cycle,
          approval_requirements = excluded.approval_requirements,
          consultation_requirements = excluded.consultation_requirements,
          required_communication_methods = excluded.required_communication_methods,
          recommended_communication_methods = excluded.recommended_communication_methods,
          related_pal_policy = excluded.related_pal_policy,
          status = excluded.status,
          source_updated_at = excluded.source_updated_at,
          local_synced_at = excluded.local_synced_at,
          updated_at = now()
        RETURNING id, xmax = 0 AS inserted
      `,
      [
        departmentPolicyId,
        canonicalName,
        requirementForLocalPolicy,
        sourceOfRequirement,
        "local_policy_detail_list",
        buildDescription(row),
        inferVisibility(requiredCommunicationMethods, recommendedCommunicationMethods),
        requirementForLocalPolicy === "Mandatory",
        inferRiskLevel(requirementForLocalPolicy),
        approvalRequirements,
        approvalRequirements?.toLowerCase().includes("school council") ?? false,
        templateLink,
        row.templateLastUpdatedAt ? new Date(row.templateLastUpdatedAt) : null,
        cleanText(row.reviewCycle),
        approvalRequirements,
        cleanText(row.consultationRequirements),
        requiredCommunicationMethods,
        recommendedCommunicationMethods,
        cleanText(row.relatedPalPolicy),
        row.templateLastUpdatedAt ? new Date(row.templateLastUpdatedAt) : new Date()
      ]
    );

    const upserted = upsertResult.rows[0];
    if (!upserted) throw new Error(`Failed to upsert row ${index + 1}: ${canonicalName}`);
    if (upserted.inserted) inserted += 1;
    else updated += 1;

    await pool.query("DELETE FROM policy_alias WHERE policy_requirement_id = $1 AND source = 'policy_detail_list'", [upserted.id]);
    const aliases = buildAliases(canonicalName, templateLink);
    for (const alias of aliases) {
      await pool.query(
        `
          INSERT INTO policy_alias (policy_requirement_id, alias_text, alias_type, source, confidence, updated_at)
          VALUES ($1, $2, 'policy_detail_list', 'policy_detail_list', '1', now())
        `,
        [upserted.id, alias]
      );
      aliasesInserted += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        sourceRows: rows.length,
        inserted,
        updated,
        aliasesInserted
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

async function assertRequiredColumnsExist(pool: pg.Pool): Promise<void> {
  const requiredColumns = [
    "requirement_for_local_policy",
    "source_of_requirement",
    "local_policy_template_link",
    "template_last_updated_at",
    "review_cycle",
    "approval_requirements",
    "consultation_requirements",
    "required_communication_methods",
    "recommended_communication_methods",
    "related_pal_policy"
  ];

  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'policy_requirement'
        AND column_name = ANY($1)
    `,
    [requiredColumns]
  );

  if (result.rowCount !== requiredColumns.length) {
    const found = new Set(result.rows.map((row) => row.column_name));
    const missing = requiredColumns.filter((column) => !found.has(column));
    throw new Error(`policy_requirement is missing imported spreadsheet columns: ${missing.join(", ")}`);
  }
}

function buildDescription(row: PolicyDetailRow): string {
  const parts = [
    cleanText(row.localPolicyTopic),
    cleanText(row.requirementForLocalPolicy),
    cleanText(row.relatedPalPolicy)
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildAliases(canonicalName: string, templateLink: string | null): string[] {
  const aliases = new Set<string>([canonicalName, `${canonicalName} Policy`]);
  if (templateLink) {
    aliases.add(templateLink);
    aliases.add(templateLink.replace(/-policy-template\.docx$/i, "").replace(/-/g, " "));
  }
  return [...aliases].map(cleanText).filter((alias): alias is string => Boolean(alias));
}

function inferVisibility(requiredMethods: string[], recommendedMethods: string[]): "public" | "internal" | "public_and_internal" {
  const allMethods = [...requiredMethods, ...recommendedMethods].join("\n").toLowerCase();
  return allMethods.includes("school website") || allMethods.includes("school community") ? "public" : "internal";
}

function inferRiskLevel(requirementForLocalPolicy: string | null): "critical" | "high" | "medium" | "low" {
  if (requirementForLocalPolicy === "Mandatory") return "high";
  if (requirementForLocalPolicy?.startsWith("Mandatory -")) return "medium";
  return "low";
}

function cleanList(value: string[] | null | undefined): string[] {
  return (value ?? []).map(cleanText).filter((item): item is string => Boolean(item) && item.toLowerCase() !== "not applicable");
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function parseArgs(values: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function stringArg(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}
