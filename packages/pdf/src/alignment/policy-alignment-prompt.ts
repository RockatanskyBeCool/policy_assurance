import type { ParsedPage } from "../extraction/types.js";
import type { TemplateClause } from "./schemas.js";

export const POLICY_ALIGNMENT_SYSTEM_PROMPT = [
  "You compare a completed school policy against a Department policy template.",
  "Return strict JSON only. Do not include markdown. Do not include commentary.",
  "Do not invent requirements, facts, dates, or citations.",
  "Every finding must cite source text from the completed policy when evidence exists.",
  "If a required template clause is missing, cite the closest relevant completed-policy text or use null source text.",
  "Distinguish acceptable school customisation from substantive gaps.",
  "Confidence values and scores must be numbers from 0 to 1."
].join(" ");

export interface PolicyAlignmentPromptInput {
  policyTitle?: string;
  schoolName?: string;
  templateName: string;
  templateVersion?: string;
  templateLastUpdatedAt?: string;
  clauses: TemplateClause[];
  pages: Pick<ParsedPage, "pageNumber" | "text" | "tables">[];
}

export function buildPolicyAlignmentPrompt(input: PolicyAlignmentPromptInput): string {
  const currentDate = new Date().toISOString().slice(0, 10);
  return `
Analyse whether the completed policy aligns with the supplied Department template.

Current date: ${currentDate}
Completed policy title: ${input.policyTitle ?? "unknown"}
School name: ${input.schoolName ?? "unknown"}
Template name: ${input.templateName}
Template version: ${input.templateVersion ?? "unknown"}
Template last updated: ${input.templateLastUpdatedAt ?? "unknown"}

Assessment rules:
- Treat school-specific wording, locations, roles, names, local communication methods, and local review metadata as acceptable customisation when the template intent is preserved.
- Do not require instructional or sample-only template text to appear in the final policy.
- Flag instructional text if it appears to remain in the completed policy.
- Flag unresolved placeholders such as "[insert ...]", "Example School", or template options that were not deleted.
- Prioritise mandatory clauses, current device/procedure references, communication requirements, approval/review requirements, and resource references.
- Use "positive_alignment" sparingly for important strengths that help the user trust the report.
- Keep each finding specific and action-oriented.
- The executive summary should be user-facing and concise.

Return STRICT JSON matching this shape:
{
  "policyTitle": string | null,
  "templateName": string | null,
  "templateVersion": string | null,
  "overallScore": number,
  "templateVersionCurrent": boolean | null,
  "executiveSummary": string,
  "criteria": [
    {
      "key": string,
      "label": string,
      "status": "pass" | "partial" | "fail" | "not_applicable" | "unknown",
      "score": number,
      "summary": string
    }
  ],
  "findings": [
    {
      "findingType": "missing_required_section" | "mandatory_clause_missing" | "template_version_outdated" | "school_customisation_needed" | "instructional_text_present" | "placeholder_unresolved" | "substantive_wording_changed" | "resource_reference_outdated" | "positive_alignment",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "clauseKey": string | null,
      "heading": string | null,
      "title": string,
      "explanation": string,
      "recommendedAction": string,
      "evidence": {
        "pageNumber": number | null,
        "sourceText": string | null,
        "confidence": number,
        "notes": string | null
      }
    }
  ],
  "requiresHumanReview": boolean
}

Suggested criteria keys:
- structure
- mandatory_clauses
- school_customisation
- current_template_content
- communication
- review_and_approval
- template_hygiene

Department template clauses:
${input.clauses.map(formatClause).join("\n\n---\n\n")}

Completed policy pages:
${input.pages.map(formatPage).join("\n\n---\n\n")}
`.trim();
}

function formatClause(clause: TemplateClause): string {
  const flags = [
    clause.isMandatory ? "mandatory" : "non-mandatory",
    clause.isEditable ? "editable" : "not editable",
    `type=${clause.clauseType}`
  ].join(", ");
  return [
    `Clause ${clause.clauseKey} (${flags})`,
    clause.heading ? `Heading: ${clause.heading}` : undefined,
    clause.expectedPosition ? `Expected position: ${clause.expectedPosition}` : undefined,
    clause.clauseText
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPage(page: Pick<ParsedPage, "pageNumber" | "text" | "tables">): string {
  const tableText = page.tables?.length ? `\nTables:\n${page.tables.map((table) => table.markdown).join("\n\n")}` : "";
  return `Page ${page.pageNumber}\n${page.text}${tableText}`;
}
