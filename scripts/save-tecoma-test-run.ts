import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { discoverFromSitemaps, filterMvpPolicyCandidates, profileCms, SchoolSiteCrawler, sortCandidatePdfs } from "@school-policy/crawler";
import { createDb, schema } from "@school-policy/db";
import { matchPolicyCandidate } from "@school-policy/matching";
import type { CandidatePdf, CrawlSeed, DepartmentPolicyRecord } from "@school-policy/shared";

const homepageUrl = "https://tecomaps.vic.edu.au/";
const departmentSchoolId = "TEMP-TECOMA-PS";
const schoolName = "Tecoma Primary School";
const allowLive = process.argv.includes("--live");
const userAgent = "SchoolPolicyComplianceMvp/0.1 (+local development; single-school test)";

if (!allowLive) {
  console.error("Refusing to run a live external test without --live.");
  console.error("Run: npx tsx scripts/save-tecoma-test-run.ts --live");
  process.exit(1);
}

const policyNames = [
  "Child Safety Policy",
  "Child Safe Standards Policy",
  "Student Wellbeing and Engagement Policy",
  "Complaints Policy",
  "Privacy Policy",
  "Anaphylaxis Policy",
  "Attendance Policy",
  "Yard Duty and Supervision Policy",
  "Bullying Prevention Policy",
  "Digital Learning Policy"
];

const policies: DepartmentPolicyRecord[] = policyNames.map((name, index) => ({
  departmentPolicyId: `TEMP-${String(index + 1).padStart(3, "0")}`,
  canonicalName: name,
  visibility: "public",
  riskLevel: index < 3 ? "critical" : "medium",
  councilEndorsementRequired: false,
  aliases: [name],
  reviewCadenceMonths: 24
}));

const commonPolicyPaths = [
  "/policies",
  "/policy",
  "/school-policies",
  "/our-school/policies",
  "/about/policies",
  "/about-us/policies",
  "/resources",
  "/documents",
  "/downloads",
  "/parent-information",
  "/parents",
  "/community"
];

const db = createDb();
const storageRoot = path.resolve(process.env.OBJECT_STORAGE_ROOT ?? "./storage");

const school = await upsertSchool();
const policyRows = await upsertTemporaryPolicies();

const cmsProfile = await profileCms(homepageUrl, { userAgent });
const sitemapDiscovery =
  cmsProfile.cmsType === "wordpress"
    ? await discoverFromSitemaps(cmsProfile.sitemapUrls, homepageUrl, {
        userAgent,
        maxSitemaps: 12,
        maxUrls: 500
      })
    : { sitemapUrlsFetched: [], pageUrls: [], pdfUrls: [], errors: [] };

await upsertSiteProfile();

const seeds: CrawlSeed[] = [
  { schoolId: school.id, url: homepageUrl, reason: "homepage", priority: 20 },
  ...commonPolicyPaths.map((urlPath, index) => ({
    schoolId: school.id,
    url: new URL(urlPath, homepageUrl).toString(),
    reason: "known_policy_page" as const,
    priority: 15 - Math.min(index, 10)
  })),
  ...sitemapDiscovery.pageUrls.slice(0, 80).map((page) => ({
    schoolId: school.id,
    url: page.url,
    reason: "sitemap" as const,
    priority: page.priority + 10
  }))
];

const [crawlRun] = await db
  .insert(schema.crawlRuns)
  .values({
    schoolId: school.id,
    crawlType: "full_discovery",
    crawlStatus: "running",
    seedUrls: seeds.map((seed) => seed.url),
    summary: "Tecoma local test run using WordPress playbook"
  })
  .returning();

if (!crawlRun) throw new Error("Failed to create crawl run");

const crawler = new SchoolSiteCrawler();
const result = await crawler.crawl({
  seeds,
  maxPages: 40,
  maxDepth: 5,
  maxPdfCandidates: 50,
  allowedDomains: [new URL(homepageUrl).hostname],
  requestDelayMs: 1500,
  userAgent
});

const pageIdByUrl = new Map<string, string>();
for (const page of result.pages) {
  const htmlStorageUri = page.html
    ? await writeTextArtifact(
        path.join("schools", school.id, "crawl-runs", crawlRun.id, "pages", `${page.contentHash}.html`),
        page.html
      )
    : undefined;

  const [snapshot] = await db
    .insert(schema.pageSnapshots)
    .values({
      crawlRunId: crawlRun.id,
      schoolId: school.id,
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      title: page.title,
      htmlStorageUri,
      contentHash: page.contentHash,
      httpStatus: 200,
      contentType: "text/html",
      crawlDepth: 0
    })
    .returning();

  if (!snapshot) continue;
  pageIdByUrl.set(page.normalizedUrl, snapshot.id);

  await db
    .insert(schema.crawlUrlCache)
    .values({
      schoolId: school.id,
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      urlType: "html",
      httpStatus: 200,
      contentType: "text/html",
      contentHash: page.contentHash,
      lastCheckedAt: new Date(),
      cacheStatus: page.cacheStatus === "not_modified" ? "not_modified" : "changed",
      storageUri: htmlStorageUri
    })
    .onConflictDoUpdate({
      target: [schema.crawlUrlCache.schoolId, schema.crawlUrlCache.normalizedUrl],
      set: {
        httpStatus: 200,
        contentType: "text/html",
        contentHash: page.contentHash,
        lastSeenAt: new Date(),
        lastCheckedAt: new Date(),
        cacheStatus: page.cacheStatus === "not_modified" ? "not_modified" : "changed",
        storageUri: htmlStorageUri
      }
    });

  for (const link of page.links) {
    await db.insert(schema.pageLinks).values({
      pageSnapshotId: snapshot.id,
      schoolId: school.id,
      sourceUrl: page.url,
      targetUrl: link.targetUrl,
      normalizedTargetUrl: link.normalizedTargetUrl,
      linkText: link.linkText,
      surroundingText: link.surroundingText,
      linkType: link.linkType,
      fileExtension: extensionFromUrl(link.normalizedTargetUrl),
      isSameDomain: link.isSameDomain,
      discoveryScore: String(link.discoveryScore)
    });
  }
}

const sitemapPdfCandidates: CandidatePdf[] = sitemapDiscovery.pdfUrls.map((pdf) => ({
  url: pdf.url,
  sourcePageUrl: pdf.sourceSitemapUrl,
  filename: new URL(pdf.url).pathname.split("/").filter(Boolean).at(-1),
  discoveryScore: pdf.priority
}));

const candidates = filterMvpPolicyCandidates(dedupeCandidates(sortCandidatePdfs([...result.candidatePdfs, ...sitemapPdfCandidates]))).slice(0, 50);
const pdfRowByUrl = new Map<string, typeof schema.discoveredPdfs.$inferSelect>();

for (const candidate of candidates) {
  const contentHash = hashText(candidate.url);
  const [pdf] = await db
    .insert(schema.discoveredPdfs)
    .values({
      schoolId: school.id,
      crawlRunId: crawlRun.id,
      sourcePageUrl: candidate.sourcePageUrl,
      pdfUrl: candidate.url,
      normalizedPdfUrl: candidate.url,
      filename: candidate.filename,
      linkText: candidate.linkText,
      surroundingText: candidate.surroundingText,
      contentHash,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      isCurrentlyAccessible: true
    })
    .returning();
  if (!pdf) continue;
  pdfRowByUrl.set(candidate.url, pdf);

  await db
    .insert(schema.crawlUrlCache)
    .values({
      schoolId: school.id,
      url: candidate.url,
      normalizedUrl: candidate.url,
      urlType: "pdf",
      contentHash,
      lastCheckedAt: new Date(),
      cacheStatus: "fresh"
    })
    .onConflictDoUpdate({
      target: [schema.crawlUrlCache.schoolId, schema.crawlUrlCache.normalizedUrl],
      set: {
        urlType: "pdf",
        contentHash,
        lastSeenAt: new Date(),
        lastCheckedAt: new Date(),
        cacheStatus: "fresh"
      }
    });
}

const candidateMatches = candidates
  .map((candidate) => ({
    candidate,
    match: matchPolicyCandidate(
      {
        filename: candidate.filename,
        linkText: candidate.linkText,
        surroundingText: candidate.surroundingText
      },
      policies
    )
  }))
  .filter((item) => item.match);

const bestMatchByPolicy = new Map<string, (typeof candidateMatches)[number]>();
for (const item of candidateMatches) {
  const policyId = item.match?.departmentPolicyId;
  if (!policyId) continue;
  const existing = bestMatchByPolicy.get(policyId);
  if (!existing || (item.match?.confidence ?? 0) > (existing.match?.confidence ?? 0)) {
    bestMatchByPolicy.set(policyId, item);
  }
}

const matches = [...bestMatchByPolicy.values()];
const savedMatches: Array<{ departmentPolicyId: string; matchId: string; pdfId: string; publicUrl: string; confidence: number }> = [];

for (const item of matches) {
  if (!item.match) continue;
  const pdf = pdfRowByUrl.get(item.candidate.url);
  const policy = policyRows.get(item.match.departmentPolicyId);
  if (!pdf || !policy) continue;

  const [savedMatch] = await db
    .insert(schema.policyCandidateMatches)
    .values({
      discoveredPdfId: pdf.id,
      policyRequirementId: policy.id,
      matchStatus: item.match.confidence >= 0.9 ? "accepted" : "needs_review",
      matchConfidence: String(item.match.confidence),
      matchMethod: item.match.method,
      evidenceSummary: item.match.evidenceSummary,
      matchedAlias: item.match.matchedAlias
    })
    .returning();
  if (!savedMatch) continue;

  await db
    .insert(schema.schoolPolicyInventory)
    .values({
      schoolId: school.id,
      policyRequirementId: policy.id,
      currentDiscoveredPdfId: pdf.id,
      currentMatchId: savedMatch.id,
      inventoryStatus: item.match.confidence >= 0.9 ? "found" : "needs_review",
      publicUrl: item.candidate.url,
      firstFoundAt: new Date(),
      lastConfirmedAt: new Date(),
      lastChangedAt: new Date(),
      confidence: String(item.match.confidence)
    })
    .onConflictDoUpdate({
      target: [schema.schoolPolicyInventory.schoolId, schema.schoolPolicyInventory.policyRequirementId],
      set: {
        currentDiscoveredPdfId: pdf.id,
        currentMatchId: savedMatch.id,
        inventoryStatus: item.match.confidence >= 0.9 ? "found" : "needs_review",
        publicUrl: item.candidate.url,
        lastConfirmedAt: new Date(),
        lastChangedAt: new Date(),
        confidence: String(item.match.confidence)
      }
    });

  savedMatches.push({
    departmentPolicyId: item.match.departmentPolicyId,
    matchId: savedMatch.id,
    pdfId: pdf.id,
    publicUrl: item.candidate.url,
    confidence: item.match.confidence
  });
}

const foundPolicyIds = new Set(savedMatches.map((match) => match.departmentPolicyId));
const missingPolicies = policies.filter((policy) => !foundPolicyIds.has(policy.departmentPolicyId));

for (const missing of missingPolicies) {
  const policy = policyRows.get(missing.departmentPolicyId);
  if (!policy) continue;

  const [evidencePack] = await db
    .insert(schema.evidencePacks)
    .values({
      summary: `${missing.canonicalName} was not matched in the Tecoma saved test run.`,
      evidenceJson: {
        schoolId: school.id,
        crawlRunId: crawlRun.id,
        policy: missing.canonicalName,
        cmsProfile,
        sitemapDiscovery
      }
    })
    .returning();

  await db.insert(schema.complianceFindings).values({
    schoolId: school.id,
    policyRequirementId: policy.id,
    findingType: "missing_public_policy",
    severity: missing.riskLevel,
    status: "open",
    evidencePackId: evidencePack?.id,
    detectedAt: new Date(),
    lastSeenAt: new Date(),
    assignedRole: "principal",
    recommendedAction: `Confirm whether ${missing.canonicalName} is published under a different name or publish the current policy.`
  });
}

await db
  .update(schema.crawlRuns)
  .set({
    completedAt: new Date(),
    crawlStatus: "completed",
    pagesVisitedCount: result.pages.length,
    pdfsDiscoveredCount: candidates.length,
    pdfsDownloadedCount: 0,
    errorsCount: sitemapDiscovery.errors.length,
    summary: JSON.stringify({
      cmsType: cmsProfile.cmsType,
      pagesVisited: result.pages.length,
      candidatePdfCount: candidates.length,
      matchedPolicyCount: savedMatches.length,
      missingPolicyCount: missingPolicies.length
    })
  })
  .where(eq(schema.crawlRuns.id, crawlRun.id));

await db
  .update(schema.schools)
  .set({
    lastSuccessfulCrawlAt: new Date(),
    lastPolicyChangeDetectedAt: new Date()
  })
  .where(eq(schema.schools.id, school.id));

console.log(
  JSON.stringify(
    {
      schoolId: school.id,
      crawlRunId: crawlRun.id,
      pagesSaved: result.pages.length,
      linksSaved: result.pages.reduce((sum, page) => sum + page.links.length, 0),
      pdfCandidatesSaved: candidates.length,
      matchesSaved: savedMatches.length,
      missingPolicies: missingPolicies.map((policy) => policy.canonicalName),
      storageRoot,
      pageArtifactCount: result.pages.filter((page) => page.html).length
    },
    null,
    2
  )
);

async function upsertSchool() {
  const [existing] = await db.select().from(schema.schools).where(eq(schema.schools.departmentSchoolId, departmentSchoolId));
  if (existing) return existing;

  const [created] = await db
    .insert(schema.schools)
    .values({
      departmentSchoolId,
      schoolName,
      schoolType: "primary",
      state: "Victoria",
      websiteUrl: homepageUrl,
      canonicalDomain: new URL(homepageUrl).hostname,
      status: "active"
    })
    .returning();

  if (!created) throw new Error("Failed to create school");
  return created;
}

async function upsertTemporaryPolicies() {
  const rows = new Map<string, typeof schema.policyRequirements.$inferSelect>();
  for (const policy of policies) {
    const [existing] = await db.select().from(schema.policyRequirements).where(eq(schema.policyRequirements.departmentPolicyId, policy.departmentPolicyId));
    const row =
      existing ??
      (
        await db
          .insert(schema.policyRequirements)
          .values({
            departmentPolicyId: policy.departmentPolicyId,
            canonicalName: policy.canonicalName,
            policyCategory: "temporary_test",
            description: `Temporary policy requirement for local testing: ${policy.canonicalName}`,
            visibility: policy.visibility,
            appliesToAllSchools: true,
            riskLevel: policy.riskLevel,
            councilEndorsementRequired: policy.councilEndorsementRequired,
            status: "active",
            sourceUpdatedAt: new Date()
          })
          .returning()
      )[0];

    if (!row) throw new Error(`Failed to upsert policy ${policy.canonicalName}`);
    rows.set(policy.departmentPolicyId, row);

    for (const alias of policy.aliases) {
      const existingAliases = await db.select().from(schema.policyAliases).where(eq(schema.policyAliases.policyRequirementId, row.id));
      if (!existingAliases.some((existingAlias) => existingAlias.aliasText === alias)) {
        await db.insert(schema.policyAliases).values({
          policyRequirementId: row.id,
          aliasText: alias,
          aliasType: "temporary",
          source: "local_test",
          confidence: "1"
        });
      }
    }
  }
  return rows;
}

async function upsertSiteProfile() {
  const [existing] = await db.select().from(schema.schoolSiteProfiles).where(eq(schema.schoolSiteProfiles.schoolId, school.id));
  const values = {
    homepageUrl,
    knownPolicyPageUrl: "https://tecomaps.vic.edu.au/newsletters-forms/",
    knownDocumentRepositoryUrl: "https://tecomaps.vic.edu.au/newsletters-forms/",
    cmsType: cmsProfile.cmsType,
    sitemapUrl: cmsProfile.sitemapUrls[0],
    robotsUrl: new URL("/robots.txt", homepageUrl).toString(),
    crawlStrategy: "wordpress_playbook",
    crawlDepthLimit: 5,
    knownPolicyPages: [
      ...new Set([
        "https://tecomaps.vic.edu.au/newsletters-forms/",
        "https://tecomaps.vic.edu.au/out-of-school-hours-care/",
        ...sitemapDiscovery.pageUrls.slice(0, 20).map((page) => page.url)
      ])
    ],
    knownDocumentPages: sitemapDiscovery.pageUrls.slice(0, 20).map((page) => page.url),
    knownPdfPatterns: [`${new URL(homepageUrl).origin}/wp-content/uploads/`],
    lastProfiledAt: new Date()
  };

  if (existing) {
    await db.update(schema.schoolSiteProfiles).set(values).where(eq(schema.schoolSiteProfiles.id, existing.id));
    return;
  }

  await db.insert(schema.schoolSiteProfiles).values({
    schoolId: school.id,
    ...values
  });
}

async function writeTextArtifact(relativePath: string, contents: string): Promise<string> {
  const absolutePath = path.join(storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, "utf8");
  return relativePath;
}

function extensionFromUrl(url: string): string | undefined {
  const basename = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  const ext = basename?.includes(".") ? basename.split(".").at(-1) : undefined;
  return ext?.toLowerCase();
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function dedupeCandidates(candidates: CandidatePdf[]): CandidatePdf[] {
  const seen = new Set<string>();
  const deduped: CandidatePdf[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }
  return deduped;
}
