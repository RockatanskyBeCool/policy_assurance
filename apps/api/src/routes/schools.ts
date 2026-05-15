import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createDb, schema } from "@school-policy/db";
import { evaluatePolicyInventoryRow } from "@school-policy/rules";

const db = createDb();

interface SchoolRow {
  id: string;
  department_school_id: string;
  school_name: string;
  school_type: string | null;
  address: string | null;
  region: string | null;
  website_url: string;
  principal: string | null;
  council_president: string | null;
  last_successful_crawl_at: Date | string | null;
}

export async function registerSchoolRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/search", async (request) => {
    const { q, query, limit } = request.query as { q?: string; query?: string; limit?: string };
    const searchTerm = (q ?? query ?? "").trim();
    const resultLimit = clamp(Number(limit) || 8, 1, 20);
    const schools = await selectSchoolRows();

    const scoredSchools = schools
      .map((school) => ({
        school,
        score: scoreSchoolMatch(searchTerm, school)
      }))
      .filter((item) => (searchTerm ? item.score > 0 : true))
      .sort((left, right) => right.score - left.score || left.school.school_name.localeCompare(right.school.school_name))
      .slice(0, resultLimit);

    return {
      query: searchTerm,
      schools: scoredSchools.map(({ school, score }) => ({
        id: school.id,
        departmentSchoolId: school.department_school_id,
        schoolName: school.school_name,
        schoolType: school.school_type,
        region: school.region,
        websiteUrl: school.website_url,
        lastSuccessfulCrawlAt: toIsoDateTime(school.last_successful_crawl_at),
        score
      }))
    };
  });

  app.get("/schools/:schoolId/policy-inventory", async (request, reply) => {
    const { schoolId } = request.params as { schoolId: string };
    const school = await resolveSchool(schoolId);

    if (!school) {
      return reply.code(404).send({
        message: `School "${schoolId}" was not found.`
      });
    }

    const evaluationDate = new Date();
    const requirements = await db
      .select()
      .from(schema.policyRequirements)
      .where(
        and(
          eq(schema.policyRequirements.status, "active"),
          eq(schema.policyRequirements.mandatory, true),
          eq(schema.policyRequirements.visibility, "public")
        )
      );
    const requirementIds = requirements.map((requirement) => requirement.id);

    const inventoryRows = await db
      .select()
      .from(schema.schoolPolicyInventory)
      .where(eq(schema.schoolPolicyInventory.schoolId, school.id));
    const inventoryByRequirementId = new Map(inventoryRows.map((row) => [row.policyRequirementId, row]));

    const discoveredPdfIds = inventoryRows
      .map((row) => row.currentDiscoveredPdfId)
      .filter((value): value is string => Boolean(value));
    const matchIds = inventoryRows.map((row) => row.currentMatchId).filter((value): value is string => Boolean(value));

    const discoveredPdfs =
      discoveredPdfIds.length > 0
        ? await db.select().from(schema.discoveredPdfs).where(inArray(schema.discoveredPdfs.id, discoveredPdfIds))
        : [];
    const discoveredPdfById = new Map(discoveredPdfs.map((row) => [row.id, row]));

    const matches =
      matchIds.length > 0 ? await db.select().from(schema.policyCandidateMatches).where(inArray(schema.policyCandidateMatches.id, matchIds)) : [];
    const matchById = new Map(matches.map((row) => [row.id, row]));

    const allPolicyMatches =
      requirementIds.length > 0
        ? await db
            .select()
            .from(schema.policyCandidateMatches)
            .where(inArray(schema.policyCandidateMatches.policyRequirementId, requirementIds))
        : [];
    const matchedPdfIds = [...new Set(allPolicyMatches.map((match) => match.discoveredPdfId))];
    const matchedPdfs =
      matchedPdfIds.length > 0
        ? await db.select().from(schema.discoveredPdfs).where(inArray(schema.discoveredPdfs.id, matchedPdfIds))
        : [];
    const matchedPdfById = new Map(matchedPdfs.filter((pdf) => pdf.schoolId === school.id).map((pdf) => [pdf.id, pdf]));
    const policyLinkHealth = buildPolicyLinkHealth(allPolicyMatches, matchedPdfById);

    const findings =
      requirementIds.length > 0
        ? await db
            .select()
            .from(schema.complianceFindings)
            .where(and(eq(schema.complianceFindings.schoolId, school.id), inArray(schema.complianceFindings.policyRequirementId, requirementIds)))
        : [];
    const openBrokenLinkFindingsByPolicy = countOpenBrokenLinkFindingsByPolicy(findings);
    const openDuplicateFindingsByPolicy = countOpenDuplicateFindingsByPolicy(findings);

    const extractions =
      discoveredPdfIds.length > 0
        ? await db.select().from(schema.pdfExtractions).where(inArray(schema.pdfExtractions.discoveredPdfId, discoveredPdfIds))
        : [];
    const extractionByPdfId = latestExtractionByPdfId(extractions);

    const policies = requirements
      .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName))
      .map((requirement) => {
        const inventory = inventoryByRequirementId.get(requirement.id);
        const discoveredPdf = inventory?.currentDiscoveredPdfId ? discoveredPdfById.get(inventory.currentDiscoveredPdfId) : undefined;
        const extraction = discoveredPdf ? extractionByPdfId.get(discoveredPdf.id) : undefined;
        const match = inventory?.currentMatchId ? matchById.get(inventory.currentMatchId) : undefined;
        const present = Boolean(inventory?.currentDiscoveredPdfId && inventory.inventoryStatus !== "missing");
        const evaluation = evaluatePolicyInventoryRow({
          present,
          nextReviewDate: extraction?.detectedNextReviewDate ?? null,
          evaluationDate
        });
        const linkHealth = policyLinkHealth.get(requirement.id);
        const brokenLinkCount = Math.max(linkHealth?.brokenPdfUrls.size ?? 0, openBrokenLinkFindingsByPolicy.get(requirement.id) ?? 0);
        const duplicateCandidateCount = linkHealth?.pdfUrls.size ?? 0;
        const duplicateFindingCount = openDuplicateFindingsByPolicy.get(requirement.id) ?? 0;
        const duplicates = duplicateCandidateCount > 1 || duplicateFindingCount > 0;

        return {
          policyRequirementId: requirement.id,
          policyName: requirement.canonicalName,
          present: evaluation.present,
          linked: evaluation.present && brokenLinkCount === 0,
          duplicates,
          approvalDate: toDateString(extraction?.detectedApprovalDate),
          approvedBy: parseApprovers(extraction?.detectedApprovers),
          reviewCycleYears: parseReviewCycleYears(extraction?.detectedReviewCycle),
          nextReviewDate: toDateString(extraction?.detectedNextReviewDate),
          compliant: evaluation.compliant,
          criteria: {
            present: evaluation.present,
            linked: evaluation.present && brokenLinkCount === 0,
            noDuplicateVersions: !duplicates,
            reviewDateInFuture: evaluation.reviewDateInFuture
          },
          evidence: {
            inventoryId: inventory?.id ?? null,
            discoveredPdfId: discoveredPdf?.id ?? null,
            matchId: match?.id ?? null,
            pdfUrl: discoveredPdf?.pdfUrl ?? null,
            publicUrl: inventory?.publicUrl ?? null,
            extractionId: extraction?.id ?? null,
            extractionConfidence: parseNullableNumber(extraction?.extractionConfidence),
            requiresHumanReview: extraction?.requiresHumanReview ?? false,
            brokenLinkCount,
            duplicateFindingCount,
            duplicateCandidateCount
          }
        };
      });

    const discoveredPolicyCount = policies.filter((policy) => policy.present).length;
    const reviewCompliantCount = policies.filter((policy) => policy.criteria.reviewDateInFuture).length;

    return {
      evaluationDate: evaluationDate.toISOString(),
      school: {
        id: school.id,
        departmentSchoolId: school.department_school_id,
        schoolName: school.school_name,
        schoolType: school.school_type,
        address: school.address,
        region: school.region,
        websiteUrl: school.website_url,
        principalName: school.principal,
        councilPresidentName: school.council_president,
        lastSuccessfulCrawlAt: toIsoDateTime(school.last_successful_crawl_at)
      },
      summary: {
        requiredPolicyCount: policies.length,
        discoveredPolicyCount,
        missingPolicyCount: policies.length - discoveredPolicyCount,
        reviewCompliantCount,
        reviewNonCompliantCount: policies.length - reviewCompliantCount,
        placeholderCount: 0
      },
      policies
    };
  });
}

async function resolveSchool(identifier: string): Promise<SchoolRow | undefined> {
  if (isUuid(identifier)) {
    const [byId] = await selectSchoolRows(sql`id = ${identifier}`);
    if (byId) return byId;
  }

  const [byDepartmentId] = await selectSchoolRows(sql`department_school_id = ${identifier}`);
  if (byDepartmentId) return byDepartmentId;

  const rows = await selectSchoolRows();
  return rows.find((row) => slugify(row.school_name) === identifier || row.school_name.toLowerCase() === identifier.toLowerCase());
}

async function selectSchoolRows(whereClause?: ReturnType<typeof sql>): Promise<SchoolRow[]> {
  const query = whereClause
    ? sql<SchoolRow>`select id, department_school_id, school_name, school_type, address, region, website_url, principal, council_president, last_successful_crawl_at from school where ${whereClause}`
    : sql<SchoolRow>`select id, department_school_id, school_name, school_type, address, region, website_url, principal, council_president, last_successful_crawl_at from school`;
  const result = await db.execute(query);
  return result.rows as unknown as SchoolRow[];
}

function buildPolicyLinkHealth(
  matches: Array<typeof schema.policyCandidateMatches.$inferSelect>,
  pdfById: Map<string, typeof schema.discoveredPdfs.$inferSelect>
): Map<string, { pdfUrls: Set<string>; brokenPdfUrls: Set<string> }> {
  const healthByPolicy = new Map<string, { pdfUrls: Set<string>; brokenPdfUrls: Set<string> }>();

  for (const match of matches) {
    const pdf = pdfById.get(match.discoveredPdfId);
    if (!pdf) continue;

    const health = healthByPolicy.get(match.policyRequirementId) ?? { pdfUrls: new Set<string>(), brokenPdfUrls: new Set<string>() };
    health.pdfUrls.add(pdf.normalizedPdfUrl);
    if (!pdf.isCurrentlyAccessible || (pdf.httpStatus !== null && pdf.httpStatus >= 400)) {
      health.brokenPdfUrls.add(pdf.normalizedPdfUrl);
    }
    healthByPolicy.set(match.policyRequirementId, health);
  }

  return healthByPolicy;
}

function countOpenBrokenLinkFindingsByPolicy(
  findings: Array<typeof schema.complianceFindings.$inferSelect>
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const finding of findings) {
    if (finding.findingType !== "broken_policy_link") continue;
    if (!["open", "in_progress", "challenged"].includes(finding.status)) continue;
    counts.set(finding.policyRequirementId, (counts.get(finding.policyRequirementId) ?? 0) + 1);
  }

  return counts;
}

function countOpenDuplicateFindingsByPolicy(
  findings: Array<typeof schema.complianceFindings.$inferSelect>
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const finding of findings) {
    if (finding.findingType !== "duplicate_versions_found") continue;
    if (!["open", "in_progress", "challenged"].includes(finding.status)) continue;
    counts.set(finding.policyRequirementId, (counts.get(finding.policyRequirementId) ?? 0) + 1);
  }

  return counts;
}

function latestExtractionByPdfId(
  extractions: Array<typeof schema.pdfExtractions.$inferSelect>
): Map<string, typeof schema.pdfExtractions.$inferSelect> {
  const latest = new Map<string, typeof schema.pdfExtractions.$inferSelect>();

  for (const extraction of extractions) {
    const current = latest.get(extraction.discoveredPdfId);
    if (!current || timestamp(extraction.extractedAt ?? extraction.updatedAt) > timestamp(current.extractedAt ?? current.updatedAt)) {
      latest.set(extraction.discoveredPdfId, extraction);
    }
  }

  return latest;
}

function parseApprovers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item && typeof item.name === "string") return item.name;
      return undefined;
    })
    .filter((item): item is string => Boolean(item));
}

function parseReviewCycleYears(value?: string | null): number | null {
  if (!value) return null;

  const yearMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/i);
  if (yearMatch?.[1]) return Number(yearMatch[1]);

  const monthMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:month|mth)/i);
  if (monthMatch?.[1]) return Math.round((Number(monthMatch[1]) / 12) * 10) / 10;

  const numberOnly = value.trim().match(/^\d+(?:\.\d+)?$/);
  return numberOnly ? Number(numberOnly[0]) : null;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toDateString(value?: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toIsoDateTime(value?: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function timestamp(value: Date): number {
  return value.getTime();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreSchoolMatch(searchTerm: string, school: SchoolRow): number {
  const query = normalizeSearchText(searchTerm);
  if (!query) return 1;

  const name = normalizeSearchText(school.school_name);
  const departmentId = normalizeSearchText(school.department_school_id);
  const region = normalizeSearchText(school.region ?? "");
  const haystack = [name, departmentId, region].filter(Boolean).join(" ");

  if (name === query || departmentId === query) return 100;
  if (name.startsWith(query)) return 92;
  if (name.includes(query)) return 84;

  const queryTokens = query.split(" ").filter(Boolean);
  const nameTokens = new Set(name.split(" ").filter(Boolean));
  const tokenHits = queryTokens.filter((token) => [...nameTokens].some((nameToken) => nameToken.startsWith(token) || nameToken.includes(token))).length;
  if (queryTokens.length > 0 && tokenHits === queryTokens.length) return 72 + tokenHits;

  if (isSubsequence(query, name)) return 48;
  if (haystack.includes(query)) return 40;

  return 0;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length < 3) return false;
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
