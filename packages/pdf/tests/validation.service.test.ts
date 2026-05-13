import { describe, expect, it } from "vitest";
import { emptyPolicyMetadata } from "../src/extraction/schemas.js";
import { validateAndNormalize } from "../src/extraction/validation-service.js";

describe("validateAndNormalize", () => {
  it("normalizes Australian slash dates", () => {
    const metadata = emptyPolicyMetadata();
    metadata.approvalDate = {
      value: "12/03/2024",
      pageNumber: 1,
      sourceText: "Approved 12/03/2024",
      confidence: 0.9
    };

    expect(validateAndNormalize(metadata).metadata.approvalDate.value).toBe("2024-03-12");
  });

  it("defaults month/year dates to the last day of the month", () => {
    const metadata = emptyPolicyMetadata();
    metadata.nextReviewDate = {
      value: "June 2026",
      pageNumber: 1,
      sourceText: "Next review June 2026",
      confidence: 0.8
    };

    const result = validateAndNormalize(metadata);
    expect(result.metadata.nextReviewDate.value).toBe("2026-06-30");
    expect(result.warnings.some((warning) => warning.includes("last day of month"))).toBe(true);
  });

  it("defaults year-month dates to the last day of the month", () => {
    const metadata = emptyPolicyMetadata();
    metadata.nextReviewDate = {
      value: "2026-03",
      pageNumber: 6,
      sourceText: "scheduled for review in March 2026",
      confidence: 0.9
    };

    const result = validateAndNormalize(metadata);
    expect(result.metadata.nextReviewDate.value).toBe("2026-03-31");
  });

  it("normalizes ordinal dates with commas", () => {
    const metadata = emptyPolicyMetadata();
    metadata.approvalDate = {
      value: "20 th May, 2025",
      pageNumber: 6,
      sourceText: "approved by school council on 20 th May, 2025",
      confidence: 0.9
    };

    expect(validateAndNormalize(metadata).metadata.approvalDate.value).toBe("2025-05-20");
  });
});
