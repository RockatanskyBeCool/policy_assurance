import type { CandidatePdf } from "@school-policy/shared";

const policyTerms = [
  "policy",
  "policies",
  "policies-and-forms",
  "forms",
  "documents",
  "downloads",
  "resources",
  "parent information",
  "school information",
  "school council",
  "child safety",
  "child safe",
  "complaints",
  "privacy",
  "anaphylaxis",
  "wellbeing",
  "engagement",
  "bullying",
  "attendance",
  "duty of care",
  "inclusion",
  "yard duty",
  "digital learning"
];

const lowValueTerms = ["newsletter", "canteen", "menu", "calendar", "booklist", "uniform", "flyer"];
const mvpExcludedPolicyTerms = [
  "oshc",
  "out of school hours care",
  "out-of-school-hours-care",
  "outside school hours care",
  "before school care",
  "after school care",
  "vacation care"
];

export function scorePolicyLink(input: {
  url: string;
  linkText?: string;
  surroundingText?: string;
  sourcePageUrl?: string;
}): number {
  const haystack = [input.url, input.linkText, input.surroundingText, input.sourcePageUrl].filter(Boolean).join(" ").toLowerCase();
  let score = 0;

  for (const term of policyTerms) {
    if (haystack.includes(term)) score += term === "policy" || term === "policies" ? 2 : 4;
  }

  for (const term of lowValueTerms) {
    if (haystack.includes(term)) score -= 5;
  }

  if (input.url.toLowerCase().endsWith(".pdf")) score += 5;
  if (input.linkText && input.linkText.trim().length > 0) score += 1;

  return Math.max(0, score);
}

export function sortCandidatePdfs(candidates: CandidatePdf[]): CandidatePdf[] {
  return [...candidates].sort((left, right) => right.discoveryScore - left.discoveryScore);
}

export function isMvpExcludedPolicyCandidate(candidate: CandidatePdf): boolean {
  const haystack = [
    candidate.url,
    candidate.sourcePageUrl,
    candidate.filename,
    candidate.linkText,
    candidate.surroundingText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_+]+/g, " ");

  return mvpExcludedPolicyTerms.some((term) => haystack.includes(term));
}

export function filterMvpPolicyCandidates(candidates: CandidatePdf[]): CandidatePdf[] {
  return candidates.filter((candidate) => !isMvpExcludedPolicyCandidate(candidate));
}
