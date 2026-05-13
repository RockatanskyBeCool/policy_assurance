import * as cheerio from "cheerio";
import { extractLinks, extractPageTitle, type ExtractedLink } from "./html.js";
import { inferUrlType, normalizeUrl, sameDomain } from "./url.js";

export interface DiscoveredSchoolDetails {
  websiteUrl: string;
  canonicalDomain: string;
  schoolName?: string;
  schoolNumber?: string;
  address?: string;
  email?: string;
  phone?: string;
  state?: string;
  contactPageUrl?: string;
  inspectedUrls: string[];
}

export interface DiscoverSchoolDetailsOptions {
  userAgent?: string;
  schoolName?: string;
  maxContactPages?: number;
}

interface FetchedHtmlPage {
  url: string;
  html: string;
  title?: string;
  links: ExtractedLink[];
}

const COMMON_CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contact-us/",
  "/contact-details",
  "/contacts",
  "/our-school/contact",
  "/our-school/contact-us",
  "/school/contact",
  "/about/contact",
  "/about-us/contact-us"
];

const STATE_PATTERNS: Array<[string, RegExp]> = [
  ["Victoria", /\b(?:VIC|Victoria)\b/i],
  ["New South Wales", /\b(?:NSW|New South Wales)\b/i],
  ["Queensland", /\b(?:QLD|Queensland)\b/i],
  ["South Australia", /\b(?:SA|South Australia)\b/i],
  ["Western Australia", /\b(?:WA|Western Australia)\b/i],
  ["Tasmania", /\b(?:TAS|Tasmania)\b/i],
  ["Australian Capital Territory", /\b(?:ACT|Australian Capital Territory)\b/i],
  ["Northern Territory", /\b(?:NT|Northern Territory)\b/i]
];

export async function discoverSchoolDetails(seedUrl: string, options: DiscoverSchoolDetailsOptions = {}): Promise<DiscoveredSchoolDetails> {
  const homepage = await fetchHtmlPage(seedUrl, options);
  const homepageUrl = homepage?.url ?? normalizeUrl(seedUrl);
  const canonicalDomain = new URL(homepageUrl).hostname.replace(/^www\./, "");
  const contactUrls = homepage ? chooseContactUrls(homepage, options.maxContactPages ?? 6) : commonContactUrls(homepageUrl);
  const inspectedPages: FetchedHtmlPage[] = homepage ? [homepage] : [];

  for (const contactUrl of contactUrls) {
    const normalizedContactUrl = normalizeUrl(contactUrl);
    if (inspectedPages.some((page) => page.url === normalizedContactUrl)) continue;
    const page = await fetchHtmlPage(contactUrl, options);
    if (page && !inspectedPages.some((inspectedPage) => inspectedPage.url === page.url)) inspectedPages.push(page);
  }

  const preferredContactPages = inspectedPages.filter((page) => page.url !== homepageUrl && isLikelyContactUrl(page.url));
  const extractionPages = [...preferredContactPages, ...inspectedPages.filter((page) => !preferredContactPages.includes(page))];
  const pageExtracts = extractionPages.map((page) => extractPageDetails(page));
  const homepageExtract = homepage ? extractPageDetails(homepage) : undefined;

  const address = firstDefined(pageExtracts.map((item) => item.address));
  const state = firstDefined([inferState(address), ...pageExtracts.map((item) => item.state)]);
  const email = firstDefined(pageExtracts.map((item) => item.email));
  const phone = firstDefined(pageExtracts.map((item) => item.phone));

  return {
    websiteUrl: homepageUrl,
    canonicalDomain,
    schoolName:
      options.schoolName ??
      firstDefined([homepageExtract?.schoolName, ...pageExtracts.map((item) => item.schoolName)]) ??
      schoolNameFromDomain(canonicalDomain),
    schoolNumber: firstDefined(pageExtracts.map((item) => item.schoolNumber)),
    address,
    email,
    phone,
    state,
    contactPageUrl: preferredContactPages[0]?.url,
    inspectedUrls: uniqueUrls(inspectedPages.map((page) => page.url))
  };
}

async function fetchHtmlPage(url: string, options: DiscoverSchoolDetailsOptions): Promise<FetchedHtmlPage | undefined> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": options.userAgent ?? "SchoolPolicyComplianceMvp/0.1 (+local development)"
      },
      redirect: "follow"
    });
  } catch {
    return undefined;
  }

  if (!response.ok || inferUrlType(response.url, response.headers.get("content-type") ?? undefined) !== "html") return undefined;
  if (!sameDomain(url, response.url)) return undefined;

  const html = await response.text();
  return {
    url: normalizeUrl(response.url),
    html,
    title: extractPageTitle(html),
    links: extractLinks(html, response.url)
  };
}

function chooseContactUrls(homepage: FetchedHtmlPage, maxContactPages: number): string[] {
  return uniqueUrls([
    ...homepage.links
      .filter((link) => link.isSameDomain && link.linkType === "html")
      .map((link) => ({ url: link.normalizedTargetUrl, score: scoreContactLink(link) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((item) => item.url),
    ...commonContactUrls(homepage.url)
  ]).slice(0, maxContactPages);
}

function commonContactUrls(homepageUrl: string): string[] {
  return COMMON_CONTACT_PATHS.map((path) => normalizeUrl(path, homepageUrl));
}

function scoreContactLink(link: ExtractedLink): number {
  const haystack = `${new URL(link.normalizedTargetUrl).pathname} ${link.linkText ?? ""} ${link.surroundingText ?? ""}`.toLowerCase();
  let score = 0;
  if (/\bcontact(?:\s+us)?\b/.test(haystack) || /contact-us/.test(haystack)) score += 10;
  if (/\blocation|find us|address|phone|email|enquiries|reception|office\b/.test(haystack)) score += 4;
  if (/\bpolicy|newsletter|calendar|enrol|curriculum|gallery|login\b/.test(haystack)) score -= 5;
  return score;
}

function isLikelyContactUrl(url: string): boolean {
  return /contact|location|find-us|find_us|about-us/.test(new URL(url).pathname.toLowerCase());
}

function extractPageDetails(page: FetchedHtmlPage): Partial<Omit<DiscoveredSchoolDetails, "websiteUrl" | "canonicalDomain" | "inspectedUrls">> {
  const $ = cheerio.load(page.html);
  const jsonLd = extractJsonLdDetails($);
  const bodyText = extractBodyText($);

  return {
    schoolName: jsonLd.schoolName ?? extractSchoolName($, page.title),
    schoolNumber: extractSchoolNumber(bodyText),
    address: jsonLd.address ?? extractAddress($, bodyText),
    email: extractEmail($, page.html),
    phone: extractPhone($, bodyText),
    state: inferState(jsonLd.address ?? bodyText)
  };
}

function extractJsonLdDetails($: cheerio.CheerioAPI): { schoolName?: string; address?: string } {
  const details: { schoolName?: string; address?: string } = {};

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw) return;
    for (const item of flattenJsonLd(parseJson(raw))) {
      if (!details.schoolName && typeof item.name === "string" && isSchoolLikeName(item.name)) {
        details.schoolName = cleanText(item.name);
      }

      if (!details.address) {
        const address = formatJsonLdAddress(item.address);
        if (address) details.address = address;
      }
    }
  });

  return details;
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((item) => flattenJsonLd(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  return [record, ...flattenJsonLd(graph)];
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function formatJsonLdAddress(value: unknown): string | undefined {
  if (typeof value === "string") return cleanAddress(value);
  if (!value || typeof value !== "object") return undefined;
  const address = value as Record<string, unknown>;
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  return cleanAddress(parts.join(", "));
}

function extractSchoolName($: cheerio.CheerioAPI, pageTitle?: string): string | undefined {
  const candidates = [
    $('meta[property="og:site_name"]').attr("content"),
    $("h1").first().text(),
    pageTitle
  ];
  return firstDefined(candidates.map((candidate) => cleanSchoolName(candidate)));
}

function cleanSchoolName(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = cleanText(value)
    .replace(/\b(?:contact|contact us|home|homepage|welcome to|about us)\b/gi, "")
    .replace(/\s*[-|:]\s*$/, "")
    .replace(/^[-|:\s]+|[-|:\s]+$/g, "");
  if (!isSchoolLikeName(cleaned)) return undefined;
  return cleaned;
}

function isSchoolLikeName(value: string): boolean {
  return /\b(school|college|primary|secondary|grammar|campus|academy)\b/i.test(value);
}

function extractEmail($: cheerio.CheerioAPI, html: string): string | undefined {
  const candidates: string[] = [];
  $('a[href^="mailto:"]').each((_, element) => {
    const href = $(element).attr("href");
    const email = href?.replace(/^mailto:/i, "").split("?")[0];
    if (email) candidates.push(email);
  });
  candidates.push(...(html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
  return firstDefined(candidates.map(normalizeEmail));
}

function normalizeEmail(value?: string): string | undefined {
  const email = value?.trim().toLowerCase();
  if (!email || /\.(png|jpe?g|gif|svg|webp)$/i.test(email)) return undefined;
  return email;
}

function extractPhone($: cheerio.CheerioAPI, bodyText: string): string | undefined {
  const candidates: string[] = [];
  $('a[href^="tel:"]').each((_, element) => {
    const href = $(element).attr("href");
    if (href) candidates.push(href.replace(/^tel:/i, ""));
  });
  candidates.push(
    ...(bodyText.match(/(?:\+?61\s?)?(?:\(?0[2378]\)?[\s.-]?\d{4}[\s.-]?\d{4}|04\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|13\s?\d{2}\s?\d{2})/g) ?? [])
  );
  return firstDefined(candidates.map(normalizePhone));
}

function normalizePhone(value?: string): string | undefined {
  const phone = value?.replace(/[^\d+]/g, "");
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 11) return undefined;
  if (!digits.startsWith("0") && !digits.startsWith("61")) return undefined;
  return value?.replace(/\s+/g, " ").trim();
}

function extractSchoolNumber(bodyText: string): string | undefined {
  const match = bodyText.match(/\bschool\s*(?:number|no\.?|id|code)\D{0,20}(\d{3,6})\b/i);
  return match?.[1];
}

function extractAddress($: cheerio.CheerioAPI, bodyText: string): string | undefined {
  const blocks = collectTextBlocks($);
  const blockMatch = firstDefined(blocks.map(matchAddress));
  return blockMatch ?? matchAddress(bodyText);
}

function collectTextBlocks($: cheerio.CheerioAPI): string[] {
  const blocks: string[] = [];
  $("address, p, li, td, th, span").each((_, element) => {
    const text = cleanText($(element).text());
    if (text.length >= 10 && text.length <= 240) blocks.push(text);
  });
  return [...new Set(blocks)];
}

function matchAddress(value: string): string | undefined {
  const match = value.match(
    /\b\d{1,5}\s+[A-Za-z0-9'’ .-]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Crescent|Cres|Parade|Pde|Highway|Hwy|Place|Pl|Boulevard|Blvd|Terrace|Tce|Way)\b[\w\s,'’.-]{0,140}(?:\b\d{4}\b)?/i
  );
  return cleanAddress(match?.[0]);
}

function cleanAddress(value?: string): string | undefined {
  const address = cleanText(value)
    .replace(/\s*(?:Tel\.?|Telephone|Phone|Email|E-mail)\b.*$/i, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
  if (!address || !/\d/.test(address)) return undefined;
  return address;
}

function inferState(value?: string): string | undefined {
  if (!value) return undefined;
  return STATE_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0];
}

function extractBodyText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg").remove();
  return cleanText($("body").text());
}

function cleanText(value?: string): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && !(typeof value === "string" && value.trim() === ""));
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function schoolNameFromDomain(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
