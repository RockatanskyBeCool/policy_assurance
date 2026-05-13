import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { filenameFromUrl, SchoolSiteCrawler, sortCandidatePdfs } from "@school-policy/crawler";
import type { CrawlType } from "@school-policy/shared";

export interface CrawlSchoolJob {
  schoolId: string;
  homepageUrl: string;
  crawlType: CrawlType;
  knownPolicyPages?: string[];
  knownPdfUrls?: string[];
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

export const crawlQueue = new Queue<CrawlSchoolJob>("crawl-school", { connection });

const worker = new Worker<CrawlSchoolJob>(
  "crawl-school",
  async (job) => {
    const crawler = new SchoolSiteCrawler();
    const seeds = [
      { schoolId: job.data.schoolId, url: job.data.homepageUrl, reason: "homepage" as const, priority: 10 },
      ...(job.data.knownPolicyPages ?? []).map((url) => ({ schoolId: job.data.schoolId, url, reason: "known_policy_page" as const, priority: 20 }))
    ];

    const result = await crawler.crawl({
      seeds,
      maxPages: job.data.crawlType === "full_discovery" ? 300 : 75,
      maxDepth: 5,
      maxPdfCandidates: 100,
      allowedDomains: [new URL(job.data.homepageUrl).hostname],
      requestDelayMs: 1000,
      userAgent: "SchoolPolicyComplianceMvp/0.1 (+local development)"
    });

    const knownPdfCandidates = (job.data.knownPdfUrls ?? []).map((url) => ({
      url,
      sourcePageUrl: job.data.homepageUrl,
      filename: filenameFromUrl(url),
      discoveryScore: job.data.crawlType === "full_discovery" ? 25 : 50
    }));

    return {
      pagesVisited: result.pages.length,
      candidatePdfs: sortCandidatePdfs([...knownPdfCandidates, ...result.candidatePdfs]).slice(0, 100)
    };
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Completed crawl job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed crawl job ${job?.id}:`, error);
});

console.log("School policy worker started");
