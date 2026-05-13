import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { eq, ilike } from "drizzle-orm";
import {
  discoverFromSitemaps,
  discoverSchoolDetails,
  filterMvpPolicyCandidates,
  filenameFromUrl,
  normalizeUrl,
  profileCms,
  SchoolSiteCrawler,
  sortCandidatePdfs,
  type FetchCacheEntry,
  type DiscoveredSchoolDetails
} from "@school-policy/crawler";
import { createDb, schema } from "@school-policy/db";
import { matchPolicyCandidate } from "@school-policy/matching";
import type { CandidatePdf, CrawlSeed, CrawlType, DepartmentPolicyRecord } from "@school-policy/shared";
import { commonPolicyPaths } from "./local-test-data.js";
import { extractAndPersistPolicyMetadata, type PersistPolicyExtractionResult } from "./policy-extraction-db.js";

const args = parseArgs(process.argv.slice(2));
const schoolName = stringArg(args, "school") ?? stringArg(args, "name");
const schoolUrl = normalizeSchoolUrl(stringArg(args, "url") ?? stringArg(args, "domain") ?? stringArg(args, "website"));
const allowLive = args.live === "true" || args.live === true;
const parsePolicies = args.parse === undefined ? true : args.parse === "true" || args.parse === true;
const requestedCrawlType = parseCrawlType(stringArg(args, "crawlType") ?? stringArg(args, "type") ?? stringArg(args, "mode"));
const userAgent = "SchoolPolicyComplianceMvp/0.1 (+local development; single-school CLI)";

if (!schoolName && !schoolUrl) {
  console.error('Missing school name or URL. Example: npm run crawl:school -- --url "https://tecomaps.vic.edu.au/" --live');
  process.exit(1);
}

if (!allowLive) {
  console.error("Refusing to run without --live.");
  console.error(`Run: npm run crawl:school -- ${schoolName ? `--school "${schoolName}"` : `--url "${schoolUrl}"`} --live`);
  process.exit(1);
}

const db = createDb();
const storageRoot = path.resolve(process.env.OBJECT_STORAGE_ROOT ?? "./storage");
let schoolDetailsDiscovery: DiscoveredSchoolDetails | undefined;

const loadedSchool = await loadOrCreateSchool();
const school = loadedSchool.school;
const crawlType = requestedCrawlType ?? (loadedSchool.isNew ? "full_discovery" : "incremental_refresh");
const isBroadDiscovery = crawlType === "full_discovery";
const isKnownSchoolUpdate = !loadedSchool.isNew && !isBroadDiscovery;

const policies = await loadPolicyRecords();
const policyRowByDepartmentId = new Map<string, typeof schema.policyRequirements.$inferSelect>();
for (const row of await db.select().from(schema.policyRequirements)) {
  policyRowByDepartmentId.set(row.departmentPolicyId, row);
}

const knownProfile = await db.select().from(schema.schoolSiteProfiles).where(eq(schema.schoolSiteProfiles.schoolId, school.id));
const profile = knownProfile[0];
const inventoryRows = await db.select().from(schema.schoolPolicyInventory).where(eq(schema.schoolPolicyInventory.schoolId, school.id));
const discoveredPdfRows = await db.select().from(schema.discoveredPdfs).where(eq(schema.discoveredPdfs.schoolId, school.id));

const cmsProfile = await profileCms(school.websiteUrl, { userAgent });
const existingKnownPolicyPages = uniqueStrings([
  profile?.knownPolicyPageUrl,
  ...(profile?.knownPolicyPages ?? []),
  ...(profile?.knownDocumentPages ?? [])
]);
const knownPdfUrls = uniqueStrings([
  ...inventoryRows.map((row) => row.publicUrl),
  ...inventoryRows
    .map((row) => discoveredPdfRows.find((pdf) => pdf.id === row.currentDiscoveredPdfId)?.pdfUrl)
    .filter(Boolean),
  ...discoveredPdfRows.filter((row) => row.isCurrentlyAccessible).map((row) => row.pdfUrl)
]);
const shouldRunSitemapDiscovery = isBroadDiscovery || !profile || existingKnownPolicyPages.length === 0;
const sitemapDiscovery =
  shouldRunSitemapDiscovery && cmsProfile.cmsType === "wordpress"
    ? await discoverFromSitemaps(cmsProfile.sitemapUrls, school.websiteUrl, {
        userAgent,
        maxSitemaps: 12,
        maxUrls: 500
      })
    : { sitemapUrlsFetched: [], pageUrls: [], pdfUrls: [], errors: [] };

const knownPolicyPages = uniqueStrings([...existingKnownPolicyPages, ...(isBroadDiscovery ? sitemapDiscovery.pageUrls.slice(0, 20).map((page) => page.url) : [])]);
const includeCommonPolicyPaths = isBroadDiscovery || knownPolicyPages.length === 0;

const seeds: CrawlSeed[] = [
  { schoolId: school.id, url: school.websiteUrl, reason: "homepage", priority: isBroadDiscovery ? 20 : 5 },
  ...knownPolicyPages.map((url, index) => ({
    schoolId: school.id,
    url,
    reason: "known_policy_page" as const,
    priority: isKnownSchoolUpdate ? 40 - Math.min(index, 10) : 30 - Math.min(index, 10)
  })),
  ...(includeCommonPolicyPaths
    ? commonPolicyPaths.map((urlPath, index) => ({
        schoolId: school.id,
        url: new URL(urlPath, school.websiteUrl).toString(),
        reason: "known_policy_page" as const,
        priority: 15 - Math.min(index, 10)
      }))
    : []),
  ...(isBroadDiscovery ? sitemapDiscovery.pageUrls.slice(0, 80).map((page) => ({
    schoolId: school.id,
    url: page.url,
    reason: "sitemap" as const,
    priority: page.priority + 10
  })) : [])
].filter((seed, index, all) => all.findIndex((other) => normalizeUrl(other.url) === normalizeUrl(seed.url)) === index);

await upsertSiteProfile();

const [crawlRun] = await db
  .insert(schema.crawlRuns)
  .values({
    schoolId: school.id,
    crawlType,
    crawlStatus: "running",
    seedUrls: seeds.map((seed) => seed.url),
    summary: `${school.schoolName} ${crawlType} CLI run`
  })
  .returning();

if (!crawlRun) throw new Error("Failed to create run record");

const candidateLimit = Number(args.maxPdfs ?? (isBroadDiscovery ? 50 : Math.max(50, knownPdfUrls.length + 20)));
const crawler = new SchoolSiteCrawler(loadCachedHtml);
const result = await crawler.crawl({
  seeds,
  maxPages: Number(args.maxPages ?? (isBroadDiscovery ? 40 : 20)),
  maxDepth: 5,
  maxPdfCandidates: candidateLimit,
  allowedDomains: [new URL(school.websiteUrl).hostname],
  requestDelayMs: Number(args.delayMs ?? 1500),
  requestTimeoutMs: Number(args.timeoutMs ?? 15000),
  userAgent
});

let linksSaved = 0;
for (const page of result.pages) {
  const htmlStorageUri = page.html
    ? await writeTextArtifact(path.join("schools", school.id, "runs", crawlRun.id, "pages", `${page.contentHash}.html`), page.html)
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
      httpStatus: page.httpStatus,
      contentType: "text/html",
      crawlDepth: 0
    })
    .returning();

  if (!snapshot) continue;

  await db
    .insert(schema.crawlUrlCache)
    .values({
      schoolId: school.id,
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      urlType: "html",
      httpStatus: page.httpStatus,
      contentType: "text/html",
      etag: page.etag,
      lastModifiedHeader: page.lastModified,
      contentHash: page.contentHash,
      lastCheckedAt: new Date(),
      cacheStatus: page.cacheStatus === "not_modified" ? "not_modified" : "changed",
      storageUri: htmlStorageUri
    })
    .onConflictDoUpdate({
      target: [schema.crawlUrlCache.schoolId, schema.crawlUrlCache.normalizedUrl],
      set: {
        httpStatus: page.httpStatus,
        contentType: "text/html",
        etag: page.etag,
        lastModifiedHeader: page.lastModified,
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
    linksSaved += 1;
  }
}

const sitemapPdfCandidates: CandidatePdf[] = sitemapDiscovery.pdfUrls.map((pdf) => ({
  url: pdf.url,
  sourcePageUrl: pdf.sourceSitemapUrl,
  filename: new URL(pdf.url).pathname.split("/").filter(Boolean).at(-1),
  discoveryScore: pdf.priority
}));
const knownPdfCandidates: CandidatePdf[] = knownPdfUrls.map((url) => ({
  url,
  sourcePageUrl: profile?.knownPolicyPageUrl ?? school.websiteUrl,
  filename: filenameFromUrl(url),
  discoveryScore: isKnownSchoolUpdate ? 50 : 25
}));

const rankedCandidates = dedupeCandidates(sortCandidatePdfs([...knownPdfCandidates, ...result.candidatePdfs, ...sitemapPdfCandidates]));
const mvpCandidates = filterMvpPolicyCandidates(rankedCandidates);
const excludedMvpCandidates = rankedCandidates.length - mvpCandidates.length;
const candidates = mvpCandidates.slice(0, candidateLimit);
const pdfRowByUrl = new Map<string, typeof schema.discoveredPdfs.$inferSelect>();

for (const candidate of candidates) {
  const contentHash = hashText(candidate.url);
  const storageUri = path.join("schools", school.id, "runs", crawlRun.id, "pdf-candidates", `${contentHash}.json`);
  const previousUrlCache = await findUrlCache(candidate.url);
  const pdfMetadata = await fetchPdfMetadata(candidate.url);
  await writeTextArtifact(
    storageUri,
    JSON.stringify(
      {
        policyName: undefined,
        confidence: undefined,
        filename: candidate.filename,
        filePath: candidate.url,
        sourcePageUrl: candidate.sourcePageUrl,
        linkText: candidate.linkText,
        surroundingText: candidate.surroundingText,
        discoveryScore: candidate.discoveryScore
      },
      null,
      2
    )
  );

  const pdf = await upsertDiscoveredPdf(candidate, contentHash, storageUri, pdfMetadata);
  pdfRowByUrl.set(candidate.url, pdf);

  await db
    .insert(schema.crawlUrlCache)
    .values({
      schoolId: school.id,
      url: candidate.url,
      normalizedUrl: candidate.url,
      urlType: "pdf",
      httpStatus: pdfMetadata.httpStatus,
      contentType: pdfMetadata.contentType,
      etag: pdfMetadata.etag,
      lastModifiedHeader: pdfMetadata.lastModified,
      contentHash,
      lastCheckedAt: new Date(),
      cacheStatus: pdfMetadata.isAccessible ? pdfCacheStatus(previousUrlCache, pdfMetadata) : "failed",
      storageUri
    })
    .onConflictDoUpdate({
      target: [schema.crawlUrlCache.schoolId, schema.crawlUrlCache.normalizedUrl],
      set: {
        urlType: "pdf",
        httpStatus: pdfMetadata.httpStatus,
        contentType: pdfMetadata.contentType,
        etag: pdfMetadata.etag,
        lastModifiedHeader: pdfMetadata.lastModified,
        contentHash,
        lastSeenAt: new Date(),
        lastCheckedAt: new Date(),
        cacheStatus: pdfMetadata.isAccessible ? pdfCacheStatus(previousUrlCache, pdfMetadata) : "failed",
        storageUri
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

const candidatesByPolicy = new Map<string, Array<(typeof candidateMatches)[number]>>();
for (const item of candidateMatches) {
  const policyId = item.match?.departmentPolicyId;
  if (!policyId) continue;
  candidatesByPolicy.set(policyId, [...(candidatesByPolicy.get(policyId) ?? []), item]);
}

for (const [policyId, items] of candidatesByPolicy) {
  candidatesByPolicy.set(
    policyId,
    items.sort((left, right) => (right.match?.confidence ?? 0) - (left.match?.confidence ?? 0))
  );
}

const matches = [...candidatesByPolicy.values()]
  .map((items) => items[0])
  .filter(Boolean)
  .sort((left, right) => (right.match?.confidence ?? 0) - (left.match?.confidence ?? 0));
const savedMatches: Array<{
  departmentPolicyId: string;
  policyName: string;
  confidence: number;
  filename?: string;
  filePath: string;
  discoveredPdfId: string;
}> = [];

const extractionResults: Array<{
  policyName: string;
  pdfUrl: string;
  attemptedUrls?: string[];
  pdfExtractionId?: string;
  detectedTitle: string | null;
  detectedApprovalDate: string | null;
  detectedNextReviewDate: string | null;
  requiresHumanReview: boolean;
  error?: string;
}> = [];

if (!parsePolicies) {
  for (const item of matches) {
    const saved = await savePolicyMatch(item);
    if (saved) savedMatches.push(saved);
  }
} else {
  for (const [policyId, rankedCandidates] of candidatesByPolicy) {
    const attemptedUrls: string[] = [];
    let lastError: string | undefined;
    let parsed = false;

    for (const item of rankedCandidates) {
      if (!item.match) continue;
      const pdf = pdfRowByUrl.get(item.candidate.url);
      const policy = policyRowByDepartmentId.get(policyId);
      if (!pdf || !policy) continue;
      attemptedUrls.push(pdf.pdfUrl);

    try {
      const extraction = await extractAndPersistPolicyMetadata({ db, discoveredPdf: pdf, storageRoot });
      const saved = await savePolicyMatch(item);
      if (saved) savedMatches.push(saved);
      extractionResults.push({
        policyName: item.match.canonicalName,
        pdfUrl: pdf.pdfUrl,
        attemptedUrls,
        pdfExtractionId: extraction.pdfExtractionId,
        detectedTitle: extraction.detectedTitle,
        detectedApprovalDate: extraction.detectedApprovalDate,
        detectedNextReviewDate: extraction.detectedNextReviewDate,
        requiresHumanReview: extraction.requiresHumanReview
      });
      parsed = true;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (isFetchFailure(lastError)) {
        await saveRejectedPolicyMatch(item);
        await markPdfFetchFailure(pdf, lastError);
        await saveBrokenPolicyLinkFinding(policy, pdf, lastError);
        continue;
      }

      const saved = await savePolicyMatch(item);
      if (saved) savedMatches.push(saved);
      extractionResults.push({
        policyName: item.match.canonicalName,
        pdfUrl: pdf.pdfUrl,
        attemptedUrls,
        detectedTitle: null,
        detectedApprovalDate: null,
        detectedNextReviewDate: null,
        requiresHumanReview: true,
        error: lastError
      });
      parsed = true;
      break;
    }
  }

    if (!parsed) {
      const policy = policyRowByDepartmentId.get(policyId);
      extractionResults.push({
        policyName: rankedCandidates[0]?.match?.canonicalName ?? policy?.canonicalName ?? policyId,
        pdfUrl: attemptedUrls.at(-1) ?? "",
        attemptedUrls,
        detectedTitle: null,
        detectedApprovalDate: null,
        detectedNextReviewDate: null,
        requiresHumanReview: true,
        error: lastError ?? "No accessible matched PDF candidates were available for parsing."
      });
    }
  }
}

const foundPolicyIds = new Set(savedMatches.map((match) => match.departmentPolicyId));
const missingPolicies = policies.filter((policy) => !foundPolicyIds.has(policy.departmentPolicyId));

for (const missing of missingPolicies) {
  const policy = policyRowByDepartmentId.get(missing.departmentPolicyId);
  if (!policy) continue;
  const [evidencePack] = await db
    .insert(schema.evidencePacks)
    .values({
      summary: `${missing.canonicalName} was not matched in this run.`,
      evidenceJson: {
        schoolId: school.id,
        crawlRunId: crawlRun.id,
        policyName: missing.canonicalName,
        cmsProfile,
        sitemapDiscovery: {
          sitemapUrlsFetched: sitemapDiscovery.sitemapUrlsFetched,
          errors: sitemapDiscovery.errors
        }
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
      excludedMvpCandidateCount: excludedMvpCandidates,
      matchedPolicyCount: savedMatches.length,
      missingPolicyCount: missingPolicies.length,
      parsedPolicyCount: extractionResults.filter((item) => item.pdfExtractionId).length,
      parseErrorCount: extractionResults.filter((item) => item.error).length
    })
  })
  .where(eq(schema.crawlRuns.id, crawlRun.id));

await db.update(schema.schools).set({ lastSuccessfulCrawlAt: new Date() }).where(eq(schema.schools.id, school.id));

console.log(
  JSON.stringify(
    {
      schoolName: school.schoolName,
      crawlRunId: crawlRun.id,
      crawlType,
      schoolWasCreated: loadedSchool.isNew,
      cmsType: cmsProfile.cmsType,
      pagesSaved: result.pages.length,
      linksSaved,
      pdfCandidatesSaved: candidates.length,
      excludedMvpCandidates,
      matchesSaved: savedMatches.length,
      policyExtractionsSaved: extractionResults.filter((item) => item.pdfExtractionId).length,
      policyExtractionErrors: extractionResults.filter((item) => item.error),
      discoveredSchoolDetails: schoolDetailsDiscovery
        ? {
            contactPageUrl: schoolDetailsDiscovery.contactPageUrl,
            inspectedUrls: schoolDetailsDiscovery.inspectedUrls,
            schoolNumber: schoolDetailsDiscovery.schoolNumber,
            address: schoolDetailsDiscovery.address,
            email: schoolDetailsDiscovery.email,
            phone: schoolDetailsDiscovery.phone,
            state: schoolDetailsDiscovery.state
          }
        : undefined,
      matchedPolicies: savedMatches,
      extractedPolicies: extractionResults,
      missingPolicies: missingPolicies.map((policy) => policy.canonicalName),
      storageRoot
    },
    null,
    2
  )
);

async function savePolicyMatch(item: (typeof candidateMatches)[number]): Promise<(typeof savedMatches)[number] | undefined> {
  if (!item.match) return undefined;
  const pdf = pdfRowByUrl.get(item.candidate.url);
  const policy = policyRowByDepartmentId.get(item.match.departmentPolicyId);
  if (!pdf || !policy) return undefined;

  const matchStatus = item.match.confidence >= 0.9 ? "accepted" : "needs_review";
  const [savedMatch] = await db
    .insert(schema.policyCandidateMatches)
    .values({
      discoveredPdfId: pdf.id,
      policyRequirementId: policy.id,
      matchStatus,
      matchConfidence: String(item.match.confidence),
      matchMethod: item.match.method,
      evidenceSummary: item.match.evidenceSummary,
      matchedAlias: item.match.matchedAlias
    })
    .returning();

  if (!savedMatch) return undefined;
  const existingInventory = inventoryRows.find((row) => row.schoolId === school.id && row.policyRequirementId === policy.id);
  const policyChanged =
    !existingInventory ||
    existingInventory.currentDiscoveredPdfId !== pdf.id ||
    existingInventory.publicUrl !== item.candidate.url ||
    existingInventory.inventoryStatus !== (matchStatus === "accepted" ? "found" : "needs_review");
  const changeTimestamp = policyChanged ? new Date() : existingInventory.lastChangedAt ?? new Date();

  await db
    .insert(schema.schoolPolicyInventory)
    .values({
      schoolId: school.id,
      policyRequirementId: policy.id,
      currentDiscoveredPdfId: pdf.id,
      currentMatchId: savedMatch.id,
      inventoryStatus: matchStatus === "accepted" ? "found" : "needs_review",
      publicUrl: item.candidate.url,
      firstFoundAt: new Date(),
      lastConfirmedAt: new Date(),
      lastChangedAt: changeTimestamp,
      confidence: String(item.match.confidence)
    })
    .onConflictDoUpdate({
      target: [schema.schoolPolicyInventory.schoolId, schema.schoolPolicyInventory.policyRequirementId],
      set: {
        currentDiscoveredPdfId: pdf.id,
        currentMatchId: savedMatch.id,
        inventoryStatus: matchStatus === "accepted" ? "found" : "needs_review",
        publicUrl: item.candidate.url,
        lastConfirmedAt: new Date(),
        lastChangedAt: changeTimestamp,
        confidence: String(item.match.confidence)
      }
    });

  return {
    departmentPolicyId: item.match.departmentPolicyId,
    policyName: item.match.canonicalName,
    confidence: item.match.confidence,
    filename: item.candidate.filename,
    filePath: item.candidate.url,
    discoveredPdfId: pdf.id
  };
}

async function saveRejectedPolicyMatch(item: (typeof candidateMatches)[number]): Promise<void> {
  if (!item.match) return;
  const pdf = pdfRowByUrl.get(item.candidate.url);
  const policy = policyRowByDepartmentId.get(item.match.departmentPolicyId);
  if (!pdf || !policy) return;

  await db.insert(schema.policyCandidateMatches).values({
    discoveredPdfId: pdf.id,
    policyRequirementId: policy.id,
    matchStatus: "rejected",
    matchConfidence: String(item.match.confidence),
    matchMethod: item.match.method,
    evidenceSummary: `${item.match.evidenceSummary} Rejected during parsing because the source PDF could not be fetched.`,
    matchedAlias: item.match.matchedAlias
  });
}

async function markPdfFetchFailure(pdf: typeof schema.discoveredPdfs.$inferSelect, errorMessage: string): Promise<void> {
  const httpStatus = extractHttpStatus(errorMessage);
  await db
    .update(schema.discoveredPdfs)
    .set({
      httpStatus,
      isCurrentlyAccessible: false
    })
    .where(eq(schema.discoveredPdfs.id, pdf.id));

  await db
    .insert(schema.crawlUrlCache)
    .values({
      schoolId: school.id,
      url: pdf.pdfUrl,
      normalizedUrl: pdf.normalizedPdfUrl,
      urlType: "pdf",
      httpStatus,
      lastCheckedAt: new Date(),
      cacheStatus: "failed",
      storageUri: pdf.pdfStorageUri
    })
    .onConflictDoUpdate({
      target: [schema.crawlUrlCache.schoolId, schema.crawlUrlCache.normalizedUrl],
      set: {
        httpStatus,
        lastCheckedAt: new Date(),
        lastSeenAt: new Date(),
        cacheStatus: "failed"
      }
    });
}

async function saveBrokenPolicyLinkFinding(
  policy: typeof schema.policyRequirements.$inferSelect,
  pdf: typeof schema.discoveredPdfs.$inferSelect,
  errorMessage: string
): Promise<void> {
  const [evidencePack] = await db
    .insert(schema.evidencePacks)
    .values({
      summary: `${policy.canonicalName} matched a policy PDF link that could not be fetched.`,
      evidenceJson: {
        schoolId: school.id,
        crawlRunId: crawlRun.id,
        policyRequirementId: policy.id,
        policyName: policy.canonicalName,
        pdfUrl: pdf.pdfUrl,
        discoveredPdfId: pdf.id,
        error: errorMessage
      }
    })
    .returning();

  await db.insert(schema.complianceFindings).values({
    schoolId: school.id,
    policyRequirementId: policy.id,
    findingType: "broken_policy_link",
    severity: policy.riskLevel,
    status: "open",
    evidencePackId: evidencePack?.id,
    detectedAt: new Date(),
    lastSeenAt: new Date(),
    assignedRole: policy.responsibleRole ?? "principal",
    recommendedAction: `Update or remove the broken public link for ${policy.canonicalName}.`
  });
}

function isFetchFailure(errorMessage: string): boolean {
  return /^Failed to fetch PDF: \d{3}\b/.test(errorMessage);
}

function extractHttpStatus(errorMessage: string): number | undefined {
  const match = errorMessage.match(/^Failed to fetch PDF: (\d{3})\b/);
  return match ? Number(match[1]) : undefined;
}

interface PdfUrlMetadata {
  httpStatus?: number;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
  isAccessible: boolean;
}

async function loadCachedHtml(url: string): Promise<FetchCacheEntry | undefined> {
  const normalizedUrl = normalizeUrl(url);
  const rows = await db.select().from(schema.crawlUrlCache).where(eq(schema.crawlUrlCache.normalizedUrl, normalizedUrl));
  const cached = rows.find((row) => row.schoolId === school.id && row.urlType === "html");
  if (!cached?.contentHash) return undefined;

  let body: string | undefined;
  if (cached.storageUri) {
    try {
      body = await fs.readFile(path.join(storageRoot, cached.storageUri), "utf8");
    } catch {
      body = undefined;
    }
  }

  return {
    normalizedUrl,
    etag: cached.etag ?? undefined,
    lastModified: cached.lastModifiedHeader ?? undefined,
    contentHash: cached.contentHash ?? undefined,
    body
  };
}

async function findUrlCache(url: string): Promise<typeof schema.crawlUrlCache.$inferSelect | undefined> {
  const normalizedUrl = normalizeUrl(url);
  const rows = await db.select().from(schema.crawlUrlCache).where(eq(schema.crawlUrlCache.normalizedUrl, normalizedUrl));
  return rows.find((row) => row.schoolId === school.id);
}

async function fetchPdfMetadata(url: string): Promise<PdfUrlMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(args.timeoutMs ?? 15000));
  try {
    let response = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: controller.signal
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          range: "bytes=0-0"
        },
        redirect: "follow",
        signal: controller.signal
      });
    }

    return {
      httpStatus: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      contentLength: numericHeader(response.headers.get("content-length")),
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      isAccessible: response.ok || response.status === 206
    };
  } catch {
    return { isAccessible: false };
  } finally {
    clearTimeout(timeout);
  }
}

function pdfCacheStatus(previous: typeof schema.crawlUrlCache.$inferSelect | undefined, metadata: PdfUrlMetadata): "fresh" | "not_modified" | "changed" {
  if (!previous) return "fresh";
  const etagUnchanged = Boolean(metadata.etag && previous.etag && metadata.etag === previous.etag);
  const lastModifiedUnchanged = Boolean(
    metadata.lastModified && previous.lastModifiedHeader && metadata.lastModified === previous.lastModifiedHeader
  );
  if (etagUnchanged || lastModifiedUnchanged) return "not_modified";
  if ((metadata.etag && previous.etag && metadata.etag !== previous.etag) || (metadata.lastModified && previous.lastModifiedHeader && metadata.lastModified !== previous.lastModifiedHeader)) {
    return "changed";
  }
  return "fresh";
}

function numericHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function loadOrCreateSchool(): Promise<{ school: typeof schema.schools.$inferSelect; isNew: boolean }> {
  const existing = await loadSchool();
  if (existing) {
    if (!existing.address || !existing.email || !existing.phone || !existing.state || !existing.schoolNumber) {
      return { school: await refreshSchoolDetails(existing), isNew: false };
    }
    return { school: existing, isNew: false };
  }

  if (!schoolUrl) {
    throw new Error(`No school found for name "${schoolName}". Pass --url so the runner can discover and create the school record.`);
  }

  schoolDetailsDiscovery = await discoverSchoolDetails(schoolUrl, { userAgent, schoolName });
  const [created] = await db
    .insert(schema.schools)
    .values({
      departmentSchoolId: syntheticDepartmentSchoolId(schoolDetailsDiscovery),
      schoolNumber: schoolDetailsDiscovery.schoolNumber,
      schoolName: schoolDetailsDiscovery.schoolName ?? schoolNameFromUrl(schoolDetailsDiscovery.websiteUrl),
      address: schoolDetailsDiscovery.address,
      email: schoolDetailsDiscovery.email,
      phone: schoolDetailsDiscovery.phone,
      state: schoolDetailsDiscovery.state,
      websiteUrl: schoolDetailsDiscovery.websiteUrl,
      canonicalDomain: schoolDetailsDiscovery.canonicalDomain,
      status: "active"
    })
    .returning();

  if (!created) throw new Error(`Failed to create school record for ${schoolUrl}`);
  return { school: created, isNew: true };
}

async function refreshSchoolDetails(existing: typeof schema.schools.$inferSelect): Promise<typeof schema.schools.$inferSelect> {
  schoolDetailsDiscovery = await discoverSchoolDetails(existing.websiteUrl, { userAgent, schoolName: schoolName ?? existing.schoolName });
  const values = buildSchoolDetailUpdates(schoolDetailsDiscovery, existing);
  if (Object.keys(values).length === 0) return existing;

  const [updated] = await db.update(schema.schools).set(values).where(eq(schema.schools.id, existing.id)).returning();
  return updated ?? existing;
}

async function loadSchool(): Promise<typeof schema.schools.$inferSelect | undefined> {
  if (schoolName) {
    const [row] = await db.select().from(schema.schools).where(ilike(schema.schools.schoolName, schoolName));
    return row;
  }
  if (!schoolUrl) return undefined;
  const hostname = new URL(schoolUrl).hostname;
  const rows = await db.select().from(schema.schools);
  return rows.find((row) => row.websiteUrl === schoolUrl || row.canonicalDomain === hostname || new URL(row.websiteUrl).hostname === hostname);
}

function buildSchoolDetailUpdates(
  details: DiscoveredSchoolDetails,
  existing: typeof schema.schools.$inferSelect
): Partial<typeof schema.schools.$inferInsert> {
  const values: Partial<typeof schema.schools.$inferInsert> = {};
  if (details.schoolNumber && details.schoolNumber !== existing.schoolNumber) values.schoolNumber = details.schoolNumber;
  if (details.address && details.address !== existing.address) values.address = details.address;
  if (details.email && details.email !== existing.email) values.email = details.email;
  if (details.phone && details.phone !== existing.phone) values.phone = details.phone;
  if (details.state && details.state !== existing.state) values.state = details.state;
  if (details.websiteUrl && details.websiteUrl !== existing.websiteUrl) values.websiteUrl = details.websiteUrl;
  if (details.canonicalDomain && details.canonicalDomain !== existing.canonicalDomain) values.canonicalDomain = details.canonicalDomain;
  return values;
}

function syntheticDepartmentSchoolId(details: DiscoveredSchoolDetails): string {
  return details.schoolNumber ? `AUTO-${details.schoolNumber}` : `WEB-${details.canonicalDomain}`;
}

function schoolNameFromUrl(url: string): string {
  return new URL(url).hostname
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function upsertDiscoveredPdf(
  candidate: CandidatePdf,
  contentHash: string,
  storageUri: string,
  metadata: PdfUrlMetadata
): Promise<typeof schema.discoveredPdfs.$inferSelect> {
  const existing = (
    await db.select().from(schema.discoveredPdfs).where(eq(schema.discoveredPdfs.normalizedPdfUrl, candidate.url))
  ).find((row) => row.schoolId === school.id);

  const values = {
    crawlRunId: crawlRun.id,
    sourcePageUrl: candidate.sourcePageUrl,
    pdfUrl: candidate.url,
    normalizedPdfUrl: candidate.url,
    filename: candidate.filename,
    linkText: candidate.linkText,
    surroundingText: candidate.surroundingText,
    httpStatus: metadata.httpStatus,
    contentType: metadata.contentType,
    contentLength: metadata.contentLength,
    etag: metadata.etag,
    lastModifiedHeader: metadata.lastModified,
    contentHash,
    pdfStorageUri: storageUri,
    lastSeenAt: new Date(),
    isCurrentlyAccessible: metadata.isAccessible
  };

  if (existing) {
    const [updated] = await db.update(schema.discoveredPdfs).set(values).where(eq(schema.discoveredPdfs.id, existing.id)).returning();
    if (!updated) throw new Error(`Failed to update discovered PDF ${existing.id}`);
    return updated;
  }

  const [created] = await db
    .insert(schema.discoveredPdfs)
    .values({
      schoolId: school.id,
      ...values,
      firstSeenAt: new Date()
    })
    .returning();
  if (!created) throw new Error(`Failed to insert discovered PDF ${candidate.url}`);
  return created;
}

async function loadPolicyRecords(): Promise<DepartmentPolicyRecord[]> {
  const rows = await db.select().from(schema.policyRequirements);
  const aliases = await db.select().from(schema.policyAliases);
  return rows.map((row) => ({
    departmentPolicyId: row.departmentPolicyId,
    canonicalName: row.canonicalName,
    description: row.description ?? undefined,
    category: row.policyCategory ?? undefined,
    visibility: row.visibility,
    riskLevel: row.riskLevel,
    councilEndorsementRequired: row.councilEndorsementRequired,
    aliases: aliases.filter((alias) => alias.policyRequirementId === row.id).map((alias) => alias.aliasText),
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString()
  }));
}

async function upsertSiteProfile(): Promise<void> {
  const [existing] = await db.select().from(schema.schoolSiteProfiles).where(eq(schema.schoolSiteProfiles.schoolId, school.id));
  const knownPolicyPages = [
    existing?.knownPolicyPageUrl,
    ...(existing?.knownPolicyPages ?? []),
    ...sitemapDiscovery.pageUrls.slice(0, 20).map((page) => page.url)
  ].filter(Boolean) as string[];
  const values = {
    homepageUrl: school.websiteUrl,
    knownPolicyPageUrl: knownPolicyPages[0],
    knownDocumentRepositoryUrl: existing?.knownDocumentRepositoryUrl ?? knownPolicyPages[0],
    cmsType: cmsProfile.cmsType,
    sitemapUrl: cmsProfile.sitemapUrls[0],
    robotsUrl: new URL("/robots.txt", school.websiteUrl).toString(),
    crawlStrategy: `${cmsProfile.cmsType}_playbook`,
    crawlDepthLimit: 5,
    knownPolicyPages: [...new Set(knownPolicyPages)],
    knownDocumentPages: sitemapDiscovery.pageUrls.slice(0, 20).map((page) => page.url),
    knownPdfPatterns: [`${new URL(school.websiteUrl).origin}/wp-content/uploads/`],
    lastProfiledAt: new Date()
  };

  if (existing) {
    await db.update(schema.schoolSiteProfiles).set(values).where(eq(schema.schoolSiteProfiles.id, existing.id));
  } else {
    await db.insert(schema.schoolSiteProfiles).values({ schoolId: school.id, ...values });
  }
}

async function writeTextArtifact(relativePath: string, contents: string): Promise<string> {
  const absolutePath = path.join(storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, "utf8");
  return relativePath;
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

function parseCrawlType(value?: string): CrawlType | undefined {
  if (!value) return undefined;
  if (value === "discovery") return "full_discovery";
  if (value === "update" || value === "rescan" || value === "refresh") return "incremental_refresh";
  if (["full_discovery", "incremental_refresh", "targeted_policy_check", "manual_recheck"].includes(value)) {
    return value as CrawlType;
  }
  throw new Error(`Unsupported crawl type "${value}". Use full_discovery, incremental_refresh, targeted_policy_check, or manual_recheck.`);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => normalizeUrl(value)))];
}

function normalizeSchoolUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  return url.toString();
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
