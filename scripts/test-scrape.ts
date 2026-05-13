import { discoverFromSitemaps, filterMvpPolicyCandidates, profileCms, SchoolSiteCrawler, sortCandidatePdfs } from "@school-policy/crawler";
import { matchPolicyCandidate } from "@school-policy/matching";
import type { CrawlSeed, DepartmentPolicyRecord } from "@school-policy/shared";

const homepageUrl = "https://tecomaps.vic.edu.au/";
const schoolId = "00000000-0000-4000-8000-000000000002";
const allowLive = process.argv.includes("--live");

if (!allowLive) {
  console.error("Refusing to run a live external scrape without --live. This protects against accidental network crawling.");
  console.error("Run: npx tsx scripts/test-scrape.ts --live");
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
  aliases: [name]
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

const userAgent = "SchoolPolicyComplianceMvp/0.1 (+local development; single-school test)";
const cmsProfile = await profileCms(homepageUrl, { userAgent });
const sitemapDiscovery =
  cmsProfile.cmsType === "wordpress"
    ? await discoverFromSitemaps(cmsProfile.sitemapUrls, homepageUrl, {
        userAgent,
        maxSitemaps: 12,
        maxUrls: 500
      })
    : { sitemapUrlsFetched: [], pageUrls: [], pdfUrls: [], errors: [] };

const seeds: CrawlSeed[] = [
  { schoolId, url: homepageUrl, reason: "homepage", priority: 20 },
  ...commonPolicyPaths.map((path, index) => ({
    schoolId,
    url: new URL(path, homepageUrl).toString(),
    reason: "known_policy_page" as const,
    priority: 15 - Math.min(index, 10)
  })),
  ...sitemapDiscovery.pageUrls.slice(0, 80).map((page) => ({
    schoolId,
    url: page.url,
    reason: "sitemap" as const,
    priority: page.priority + 10
  }))
];

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

const sitemapPdfCandidates = sitemapDiscovery.pdfUrls.map((pdf) => ({
  url: pdf.url,
  sourcePageUrl: pdf.sourceSitemapUrl,
  filename: new URL(pdf.url).pathname.split("/").filter(Boolean).at(-1),
  discoveryScore: pdf.priority
}));

const candidates = filterMvpPolicyCandidates(sortCandidatePdfs([...result.candidatePdfs, ...sitemapPdfCandidates]));
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

const matches = [...bestMatchByPolicy.values()].sort((left, right) => (right.match?.confidence ?? 0) - (left.match?.confidence ?? 0));

const foundPolicyIds = new Set(matches.map((item) => item.match?.departmentPolicyId));
const missingPolicies = policies.filter((policy) => !foundPolicyIds.has(policy.departmentPolicyId));

console.log(
  JSON.stringify(
    {
      school: {
        schoolId,
        homepageUrl
      },
      cmsProfile,
      sitemapDiscovery: {
        sitemapUrlsFetched: sitemapDiscovery.sitemapUrlsFetched,
        pageUrlCount: sitemapDiscovery.pageUrls.length,
        pdfUrlCount: sitemapDiscovery.pdfUrls.length,
        errors: sitemapDiscovery.errors
      },
      seeds: {
        count: seeds.length,
        topSeeds: seeds
          .slice()
          .sort((left, right) => right.priority - left.priority)
          .slice(0, 20)
      },
      crawl: {
        pagesVisited: result.pages.length,
        candidatePdfCount: candidates.length
      },
      topCandidatePdfs: candidates.slice(0, 30),
      matchedPolicies: matches.map((item) => ({
        policy: item.match?.canonicalName,
        confidence: item.match?.confidence,
        method: item.match?.method,
        matchedAlias: item.match?.matchedAlias,
        pdfUrl: item.candidate.url,
        sourcePageUrl: item.candidate.sourcePageUrl,
        linkText: item.candidate.linkText,
        discoveryScore: item.candidate.discoveryScore
      })),
      missingPolicies: missingPolicies.map((policy) => policy.canonicalName)
    },
    null,
    2
  )
);
