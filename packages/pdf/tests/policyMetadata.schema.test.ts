import { describe, expect, it } from "vitest";
import { PolicyMetadataSchema, emptyPolicyMetadata } from "../src/extraction/schemas.js";

describe("PolicyMetadataSchema", () => {
  it("accepts a valid empty metadata object", () => {
    expect(PolicyMetadataSchema.parse(emptyPolicyMetadata()).overallConfidence).toBe(0);
  });

  it("rejects invalid confidence values", () => {
    const metadata = emptyPolicyMetadata();
    metadata.title.confidence = 2;
    expect(() => PolicyMetadataSchema.parse(metadata)).toThrow();
  });
});
