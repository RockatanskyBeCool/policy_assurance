import * as cheerio from "cheerio";
import { type CandidatePdf } from "@school-policy/shared";
import { filenameFromUrl, inferUrlType, normalizeUrl, sameDomain } from "./url.js";
import { scorePolicyLink } from "./scoring.js";

export interface ExtractedLink {
  targetUrl: string;
  normalizedTargetUrl: string;
  linkText?: string;
  surroundingText?: string;
  linkType: "html" | "pdf" | "docx" | "asset" | "external" | "unknown";
  isSameDomain: boolean;
  discoveryScore: number;
}

export function extractLinks(html: string, pageUrl: string): ExtractedLink[] {
  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    const normalizedTargetUrl = normalizeUrl(href, pageUrl);
    const linkText = $(element).text().replace(/\s+/g, " ").trim();
    const surroundingText = $(element).parent().text().replace(/\s+/g, " ").trim().slice(0, 500);
    const linkType = sameDomain(pageUrl, normalizedTargetUrl) ? inferUrlType(normalizedTargetUrl) : "external";
    const discoveryScore = scorePolicyLink({ url: normalizedTargetUrl, linkText, surroundingText, sourcePageUrl: pageUrl });

    links.push({
      targetUrl: href,
      normalizedTargetUrl,
      linkText,
      surroundingText,
      linkType,
      isSameDomain: sameDomain(pageUrl, normalizedTargetUrl),
      discoveryScore
    });
  });

  return links;
}

export function extractCandidatePdfs(html: string, pageUrl: string): CandidatePdf[] {
  return extractLinks(html, pageUrl)
    .filter((link) => link.linkType === "pdf")
    .map((link) => ({
      url: link.normalizedTargetUrl,
      sourcePageUrl: pageUrl,
      linkText: link.linkText,
      surroundingText: link.surroundingText,
      filename: filenameFromUrl(link.normalizedTargetUrl),
      discoveryScore: link.discoveryScore
    }));
}

export function extractPageTitle(html: string): string | undefined {
  const $ = cheerio.load(html);
  return $("title").first().text().replace(/\s+/g, " ").trim() || undefined;
}
