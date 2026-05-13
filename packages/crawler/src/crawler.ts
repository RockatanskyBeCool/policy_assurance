import crypto from "node:crypto";
import type { CandidatePdf, CrawlSeed } from "@school-policy/shared";
import { extractCandidatePdfs, extractLinks, extractPageTitle } from "./html.js";
import { inferUrlType, normalizeUrl, sameDomain } from "./url.js";
import { sortCandidatePdfs } from "./scoring.js";

export interface FetchCacheEntry {
  normalizedUrl: string;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  body?: string;
}

export interface CrawlPageResult {
  url: string;
  normalizedUrl: string;
  title?: string;
  html?: string;
  contentHash: string;
  etag?: string;
  lastModified?: string;
  httpStatus: number;
  links: ReturnType<typeof extractLinks>;
  candidatePdfs: CandidatePdf[];
  cacheStatus: "changed" | "not_modified";
}

export interface SchoolCrawlPlan {
  seeds: CrawlSeed[];
  maxPages: number;
  maxDepth: number;
  maxPdfCandidates: number;
  allowedDomains?: string[];
  requestDelayMs?: number;
  requestTimeoutMs?: number;
  userAgent?: string;
}

export class SchoolSiteCrawler {
  constructor(private readonly cacheLookup: (url: string) => Promise<FetchCacheEntry | undefined> = async () => undefined) {}

  async crawl(plan: SchoolCrawlPlan): Promise<{ pages: CrawlPageResult[]; candidatePdfs: CandidatePdf[] }> {
    const queue = [...plan.seeds].sort((left, right) => right.priority - left.priority);
    const visited = new Set<string>();
    const pages: CrawlPageResult[] = [];
    const pdfs = new Map<string, CandidatePdf>();

    while (queue.length > 0 && pages.length < plan.maxPages) {
      const seed = queue.shift();
      if (!seed) break;
      const normalizedUrl = normalizeUrl(seed.url);
      if (!isAllowedDomain(normalizedUrl, plan.allowedDomains)) continue;
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      const cached = await this.cacheLookup(normalizedUrl);
      const result = await this.fetchPage(normalizedUrl, cached, plan);
      if (!result) continue;

      pages.push(result);
      for (const pdf of result.candidatePdfs) {
        const existing = pdfs.get(pdf.url);
        if (!existing || pdf.discoveryScore > existing.discoveryScore) {
          pdfs.set(pdf.url, pdf);
        }
      }

      for (const link of result.links) {
        if (!link.isSameDomain || link.linkType !== "html" || link.discoveryScore < 2) continue;
        if (!isAllowedDomain(link.normalizedTargetUrl, plan.allowedDomains)) continue;
        if (visited.has(link.normalizedTargetUrl)) continue;
        queue.push({
          schoolId: seed.schoolId,
          url: link.normalizedTargetUrl,
          reason: "known_policy_page",
          priority: link.discoveryScore
        });
      }
      queue.sort((left, right) => right.priority - left.priority);
    }

    return {
      pages,
      candidatePdfs: sortCandidatePdfs([...pdfs.values()]).slice(0, plan.maxPdfCandidates)
    };
  }

  private async fetchPage(url: string, cached: FetchCacheEntry | undefined, plan: SchoolCrawlPlan): Promise<CrawlPageResult | undefined> {
    if (plan.requestDelayMs && plan.requestDelayMs > 0) {
      await sleep(plan.requestDelayMs);
    }

    const headers: Record<string, string> = {
      "user-agent": plan.userAgent ?? "SchoolPolicyComplianceMvp/0.1 (+local development; contact: local)"
    };
    if (cached?.etag) headers["if-none-match"] = cached.etag;
    if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), plan.requestTimeoutMs ?? 15_000);
    let response: Response;
    try {
      response = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 304 && cached?.body && cached.contentHash) {
      const links = extractLinks(cached.body, url);
      return {
        url,
        normalizedUrl: normalizeUrl(url),
        title: extractPageTitle(cached.body),
        html: cached.body,
        contentHash: cached.contentHash,
        etag: cached.etag,
        lastModified: cached.lastModified,
        httpStatus: 304,
        links,
        candidatePdfs: extractCandidatePdfs(cached.body, url),
        cacheStatus: "not_modified"
      };
    }

    if (!response.ok || inferUrlType(response.url, response.headers.get("content-type") ?? undefined) !== "html") {
      return undefined;
    }

    if (!sameDomain(url, response.url)) return undefined;

    const body = await response.text();
    const contentHash = crypto.createHash("sha256").update(body).digest("hex");
    const links = extractLinks(body, response.url);

    return {
      url: response.url,
      normalizedUrl: normalizeUrl(response.url),
      title: extractPageTitle(body),
      html: body,
      contentHash,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      httpStatus: response.status,
      links,
      candidatePdfs: extractCandidatePdfs(body, response.url),
      cacheStatus: "changed"
    };
  }
}

function isAllowedDomain(url: string, allowedDomains?: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  return allowedDomains.some((domain) => hostname === domain.replace(/^www\./, ""));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
