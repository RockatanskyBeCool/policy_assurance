import { describe, expect, it } from "vitest";
import { buildPolicyAlignmentPrompt, parsePolicyAlignmentReport } from "../src/index.js";

describe("policy template alignment analysis", () => {
  it("builds a prompt that separates template clauses from completed policy evidence", () => {
    const prompt = buildPolicyAlignmentPrompt({
      policyTitle: "Anaphylaxis Policy",
      schoolName: "Tecoma Primary School",
      templateName: "Anaphylaxis Policy Template",
      templateVersion: "2026-05",
      clauses: [
        {
          clauseKey: "emergency-response.neffy",
          heading: "Emergency Response",
          clauseText: "Administer Neffy nasal spray according to the listed steps.",
          clauseType: "body",
          isMandatory: true,
          isEditable: false,
          expectedPosition: 12
        }
      ],
      pages: [
        {
          pageNumber: 4,
          text: "Administer an EpiPen or EpiPen Jr. Call an ambulance (000)."
        }
      ]
    });

    expect(prompt).toContain("Treat school-specific wording");
    expect(prompt).toContain("Clause emergency-response.neffy");
    expect(prompt).toContain("mandatory, not editable");
    expect(prompt).toContain("Page 4");
    expect(prompt).toContain("Administer an EpiPen");
  });

  it("parses repaired strict JSON into a validated alignment report", () => {
    const report = parsePolicyAlignmentReport(`
      {
        "policyTitle": "Anaphylaxis Policy",
        "templateName": "Anaphylaxis Policy Template",
        "templateVersion": "2026-05",
        "overallScore": 0.74,
        "templateVersionCurrent": false,
        "executiveSummary": "The policy is structurally aligned but misses current device instructions.",
        "criteria": [
          {
            "key": "current_template_content",
            "label": "Current template content",
            "status": "partial",
            "score": 0.55,
            "summary": "EpiPen and Anapen are covered, but Jext and Neffy are not."
          }
        ],
        "findings": [
          {
            "findingType": "mandatory_clause_missing",
            "severity": "high",
            "clauseKey": "emergency-response.neffy",
            "heading": "Emergency Response",
            "title": "Neffy instructions are missing",
            "explanation": "The completed policy does not include the current nasal spray instructions from the template.",
            "recommendedAction": "Add the Neffy administration steps from the current Department template.",
            "evidence": {
              "pageNumber": 4,
              "sourceText": "Administer an EpiPen or EpiPen Jr",
              "confidence": 0.88,
              "notes": "Closest emergency response device text found."
            }
          }
        ],
        "requiresHumanReview": true
      }
    `);

    expect(report.overallScore).toBe(0.74);
    expect(report.findings[0]?.findingType).toBe("mandatory_clause_missing");
    expect(report.requiresHumanReview).toBe(true);
  });
});
