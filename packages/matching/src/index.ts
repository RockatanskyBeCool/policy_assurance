import type { DepartmentPolicyRecord, MatchMethod } from "@school-policy/shared";

export interface PolicyMatchInput {
  filename?: string;
  linkText?: string;
  surroundingText?: string;
  extractedTitle?: string;
  extractedText?: string;
}

export interface PolicyMatchResult {
  departmentPolicyId: string;
  canonicalName: string;
  confidence: number;
  method: MatchMethod;
  matchedAlias?: string;
  evidenceSummary: string;
}

export function matchPolicyCandidate(input: PolicyMatchInput, policies: DepartmentPolicyRecord[]): PolicyMatchResult | undefined {
  const haystack = [input.filename, input.linkText, input.surroundingText, input.extractedTitle, input.extractedText?.slice(0, 5000)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const haystackTokens = new Set(tokenize(haystack));

  let best: PolicyMatchResult | undefined;

  for (const policy of policies) {
    const names = [policy.canonicalName, ...policy.aliases];
    for (const name of names) {
      const normalizedName = name.toLowerCase();
      if (!normalizedName) continue;

      const exactTextMatch = haystack.includes(normalizedName);
      const filenameMatch = input.filename?.toLowerCase().includes(normalizedName.replaceAll(" ", "-")) ?? false;
      const tokenScore = scoreTokenOverlap(tokenize(normalizedName), haystackTokens);
      if (!exactTextMatch && !filenameMatch && tokenScore < 0.82) continue;

      const confidence = input.linkText?.toLowerCase().includes(normalizedName)
        ? 0.95
        : filenameMatch
          ? 0.9
          : tokenScore >= 1
            ? 0.86
            : 0.78;

      if (!best || confidence > best.confidence) {
        best = {
          departmentPolicyId: policy.departmentPolicyId,
          canonicalName: policy.canonicalName,
          confidence,
          method: confidence >= 0.9 ? "exact_alias" : "filename_match",
          matchedAlias: name,
          evidenceSummary: exactTextMatch
            ? `Matched "${name}" exactly against candidate text.`
            : `Matched "${name}" by token overlap against candidate text.`
        };
      }
    }
  }

  return best;
}

function tokenize(value: string): string[] {
  const generic = new Set(["policy", "policies", "and", "the", "school", "schools", "primary", "tecoma"]);
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !generic.has(token));
}

function scoreTokenOverlap(policyTokens: string[], haystackTokens: Set<string>): number {
  const uniquePolicyTokens = [...new Set(policyTokens)];
  if (uniquePolicyTokens.length === 0) return 0;
  const hits = uniquePolicyTokens.filter((token) => haystackTokens.has(token)).length;
  return hits / uniquePolicyTokens.length;
}
