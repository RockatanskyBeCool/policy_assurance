import * as cheerio from "cheerio";
import { normalizeUrl, sameDomain } from "./url.js";

export type CmsType = "wordpress" | "unknown";

export interface CmsProfile {
  cmsType: CmsType;
  confidence: number;
  signals: string[];
  sitemapUrls: string[];
}

export function detectCmsFromHtml(html: string, pageUrl: string): CmsProfile {
  const $ = cheerio.load(html);
  const signals: string[] = [];
  const sitemapUrls = new Set<string>();

  const generator = $('meta[name="generator"]').attr("content");
  if (generator?.toLowerCase().includes("wordpress")) signals.push("meta-generator-wordpress");

  for (const element of $("script[src], link[href], a[href]").toArray()) {
    const raw = $(element).attr("src") ?? $(element).attr("href");
    if (!raw) continue;
    const url = normalizeUrl(raw, pageUrl);
    if (url.includes("/wp-content/")) signals.push("wp-content-asset");
    if (url.includes("/wp-includes/")) signals.push("wp-includes-asset");
    if (/sitemap.*\.xml$/i.test(new URL(url).pathname) && sameDomain(pageUrl, url)) {
      sitemapUrls.add(url);
    }
  }

  const uniqueSignals = [...new Set(signals)];
  const isWordPress = uniqueSignals.some((signal) => signal.startsWith("wp-") || signal.includes("wordpress"));

  return {
    cmsType: isWordPress ? "wordpress" : "unknown",
    confidence: isWordPress ? Math.min(0.95, 0.5 + uniqueSignals.length * 0.1) : 0.1,
    signals: uniqueSignals,
    sitemapUrls: [...sitemapUrls]
  };
}

export async function profileCms(homepageUrl: string, options: { userAgent?: string } = {}): Promise<CmsProfile> {
  const response = await fetch(homepageUrl, {
    headers: {
      "user-agent": options.userAgent ?? "SchoolPolicyComplianceMvp/0.1 (+local development)"
    }
  });

  if (!response.ok) {
    return { cmsType: "unknown", confidence: 0, signals: [`homepage-fetch-${response.status}`], sitemapUrls: [] };
  }

  const html = await response.text();
  const profile = detectCmsFromHtml(html, response.url);

  if (profile.cmsType === "wordpress") {
    const base = new URL(response.url).origin;
    profile.sitemapUrls.push(`${base}/wp-sitemap.xml`, `${base}/sitemap.xml`, `${base}/sitemap_index.xml`);
    profile.sitemapUrls = [...new Set(profile.sitemapUrls)];
  }

  return profile;
}
