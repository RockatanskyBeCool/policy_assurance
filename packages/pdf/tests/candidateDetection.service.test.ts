import { describe, expect, it } from "vitest";
import { detectCandidateSections } from "../src/extraction/candidate-detection-service.js";
import type { ParsedDocument } from "../src/extraction/types.js";

describe("detectCandidateSections", () => {
  it("prioritises document control and review pages", () => {
    const document: ParsedDocument = {
      sourceFile: "test.pdf",
      pageCount: 3,
      fullText: "",
      tables: [],
      diagnostics: {},
      pages: [
        { pageNumber: 1, text: "Asthma Policy", tables: [] },
        { pageNumber: 2, text: "General body content about implementation.", tables: [] },
        { pageNumber: 3, text: "Document control Approved by School Council Next review June 2026 Version 1", tables: [] }
      ]
    };

    const candidates = detectCandidateSections(document, 2);
    expect(candidates.map((candidate) => candidate.pageNumber)).toContain(1);
    expect(candidates.map((candidate) => candidate.pageNumber)).toContain(3);
  });
});
