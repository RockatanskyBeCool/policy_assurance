import { describe, expect, it } from "vitest";
import { filterMvpPolicyCandidates, isMvpExcludedPolicyCandidate } from "../src/scoring.js";
import type { CandidatePdf } from "@school-policy/shared";

describe("MVP policy candidate filtering", () => {
  it("excludes OSHC policy candidates from main school policy matching", () => {
    const candidate: CandidatePdf = {
      url: "https://tecomaps.vic.edu.au/wp-content/uploads/2024/12/Complaints-Policy.pdf",
      sourcePageUrl: "https://tecomaps.vic.edu.au/out-of-school-hours-care/",
      filename: "Complaints-Policy.pdf",
      linkText: "Complaints Policy",
      surroundingText: "Complaints Policy",
      discoveryScore: 12
    };

    expect(isMvpExcludedPolicyCandidate(candidate)).toBe(true);
  });

  it("keeps school-level policy candidates with the same filename and link text", () => {
    const candidate: CandidatePdf = {
      url: "https://tecomaps.vic.edu.au/wp-content/uploads/2024/10/Complaints-Policy.pdf",
      sourcePageUrl: "https://tecomaps.vic.edu.au/newsletters-forms/",
      filename: "Complaints-Policy.pdf",
      linkText: "Complaints Policy",
      surroundingText: "Complaints Policy",
      discoveryScore: 11
    };

    expect(isMvpExcludedPolicyCandidate(candidate)).toBe(false);
    expect(filterMvpPolicyCandidates([candidate])).toEqual([candidate]);
  });
});
