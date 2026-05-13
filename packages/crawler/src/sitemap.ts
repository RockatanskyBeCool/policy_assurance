import * as cheerio from "cheerio";
import { normalizeUrl, sameDomain } from "./url.js";
import { scorePolicyLink } from "./scoring.js";

export interface SitemapDiscoveryResult {
  sitemapUrlsFetched: string[];
  pageUrls: Array<{ url: string; priority: number; sourceSitemapUrl: string }>;
  pdfUrls: Array<{ url: string; priority: number; sourceSitemapUrl: string }>;
  errors: Array<{ url: string; message: string }>;
}

export async function discoverFromSitemaps(
  sitemapUrls: string[],
  homepageUrl: string,
  options: {
    userAgent?: string;
    maxSitemaps?: number;
    maxUrls?: number;
  } = {}
): Promise<SitemapDiscoveryResult> {
  const queue = [...new Set(sitemapUrls.map((url) => normalizeUrl(url, homepageUrl)))];
  const fetched = new Set<string>();
  const pageUrls = new Map<string, { url: string; priority: number; sourceSitemapUrl: string }>();
  const pdfUrls = new Map<string, { url: string; priority: number; sourceSitemapUrl: string }>();
  const errors: SitemapDiscoveryResult["errors"] = [];
  const maxSitemaps = options.maxSitemaps ?? 12;
  const maxUrls = options.maxUrls ?? 400;

  while (queue.length > 0 && fetched.size < maxSitemaps && pageUrls.size + pdfUrls.size < maxUrls) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || fetched.has(sitemapUrl) || !sameDomain(homepageUrl, sitemapUrl)) continue;
    fetched.add(sitemapUrl);

    try {
      const response = await fetch(sitemapUrl, {
        headers: {
          "user-agent": options.userAgent ?? "SchoolPolicyComplianceMvp/0.1 (+local development)"
        }
      });
      if (!response.ok) {
        errors.push({ url: sitemapUrl, message: `HTTP ${response.status}` });
        continue;
      }

      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      $("sitemap > loc").each((_, element) => {
        const loc = $(element).text().trim();
        if (!loc) return;
        const url = normalizeUrl(loc, sitemapUrl);
        if (sameDomain(homepageUrl, url) && !fetched.has(url) && queue.length < maxSitemaps * 2) {
          queue.push(url);
        }
      });

      $("url > loc").each((_, element) => {
        const loc = $(element).text().trim();
        if (!loc) return;
        const url = normalizeUrl(loc, sitemapUrl);
        if (!sameDomain(homepageUrl, url)) return;

        const priority = scorePolicyLink({ url, sourcePageUrl: sitemapUrl });
        if (url.toLowerCase().endsWith(".pdf")) {
          pdfUrls.set(url, { url, priority: priority + 5, sourceSitemapUrl: sitemapUrl });
        } else if (priority > 0 || isUsefulWordPressPage(url)) {
          pageUrls.set(url, { url, priority: Math.max(priority, 3), sourceSitemapUrl: sitemapUrl });
        }
      });
    } catch (error) {
      errors.push({ url: sitemapUrl, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    sitemapUrlsFetched: [...fetched],
    pageUrls: [...pageUrls.values()].sort((left, right) => right.priority - left.priority),
    pdfUrls: [...pdfUrls.values()].sort((left, right) => right.priority - left.priority),
    errors
  };
}

function isUsefulWordPressPage(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return [
    "parent",
    "parents",
    "information",
    "school-information",
    "about",
    "community",
    "resources",
    "forms",
    "documents",
    "downloads",
    "policies"
  ].some((term) => pathname.includes(term));
}
