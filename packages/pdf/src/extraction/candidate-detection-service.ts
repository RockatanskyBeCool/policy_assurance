import type { CandidateSection, ParsedDocument, ParsedPage } from "./types.js";

const KEYWORDS = [
  "policy",
  "procedure",
  "document control",
  "approval",
  "approved by",
  "approved on",
  "approver",
  "authorised by",
  "authorized by",
  "endorsed by",
  "responsible officer",
  "policy owner",
  "custodian",
  "version",
  "version history",
  "revision history",
  "effective date",
  "commencement date",
  "next review",
  "review date",
  "scheduled review",
  "review cycle",
  "status"
];

const STRONG_TERMS = new Set([
  "document control",
  "approved by",
  "approved on",
  "authorised by",
  "endorsed by",
  "policy owner",
  "responsible officer",
  "version history",
  "revision history",
  "effective date",
  "next review",
  "review cycle"
]);

export function detectCandidateSections(document: ParsedDocument, maxCandidatePages: number): CandidateSection[] {
  const byPage = new Map<number, CandidateSection>();

  for (const page of document.pages) {
    const section = scorePage(page);
    if (page.pageNumber === 1) {
      section.score += 10;
      section.reason = appendReason(section.reason, "first page");
    }
    if (page.pageNumber === document.pageCount && hasMetadataSignal(page.text)) {
      section.score += 5;
      section.reason = appendReason(section.reason, "last page with metadata signal");
    }
    if ((page.tables?.length ?? 0) > 0 && hasMetadataSignal(page.tables?.map((table) => table.markdown).join("\n") ?? "")) {
      section.score += 8;
      section.reason = appendReason(section.reason, "metadata table");
    }
    if (section.score > 0 || page.pageNumber === 1) {
      byPage.set(page.pageNumber, section);
    }
  }

  if (document.pageCount > 3) {
    for (const pageNumber of [document.pageCount - 1, document.pageCount]) {
      const page = document.pages.find((item) => item.pageNumber === pageNumber);
      if (!page) continue;
      const existing = byPage.get(pageNumber) ?? scorePage(page);
      existing.score += 3;
      existing.reason = appendReason(existing.reason, "trailing page");
      byPage.set(pageNumber, existing);
    }
  }

  return [...byPage.values()]
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, maxCandidatePages)
    .sort((left, right) => left.pageNumber - right.pageNumber);
}

function scorePage(page: ParsedPage): CandidateSection {
  const haystack = `${page.text}\n${page.markdown ?? ""}\n${page.tables?.map((table) => table.markdown).join("\n") ?? ""}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const term of KEYWORDS) {
    const count = countOccurrences(haystack, term);
    if (!count) continue;
    const weight = STRONG_TERMS.has(term) ? 4 : 2;
    score += Math.min(count, 4) * weight;
    reasons.push(term);
  }

  if (page.text.length < 100) {
    score -= 2;
    reasons.push("sparse text");
  }

  const text = page.text.trim();
  return {
    pageNumber: page.pageNumber,
    reason: reasons.length > 0 ? reasons.join(", ") : "no strong metadata signal",
    text,
    markdown: page.markdown,
    tables: page.tables,
    score: Math.max(score, 0)
  };
}

function hasMetadataSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some((keyword) => lower.includes(keyword));
}

function countOccurrences(value: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp(escaped, "g"))?.length ?? 0;
}

function appendReason(existing: string, reason: string): string {
  if (!existing || existing === "no strong metadata signal") return reason;
  return `${existing}, ${reason}`;
}
