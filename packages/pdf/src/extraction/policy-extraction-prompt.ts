import type { CandidateSection, PageImageRef } from "./types.js";

export const SYSTEM_PROMPT = [
  "You extract governance metadata from messy school policy PDF documents.",
  "Return strict JSON only. Do not include markdown. Do not include commentary.",
  "Do not invent missing values. Use null when a value is absent or uncertain.",
  "Always cite source text and page number for every extracted value.",
  "Confidence values must be numbers from 0 to 1."
].join(" ");

export function buildExtractionPrompt(sections: CandidateSection[], images: PageImageRef[]): string {
  const currentDate = new Date().toISOString().slice(0, 10);
  return `
Extract policy metadata from the candidate pages below.

The document may be messy, inconsistently formatted, scanned, or use inconsistent terminology.
Current date for temporal checks: ${currentDate}.

Rules:
- Return STRICT JSON only. No markdown. No commentary.
- Do not invent missing values.
- If a field is not present, set value to null.
- If a field is ambiguous, set value to null unless evidence is strong.
- Normalize dates to YYYY-MM-DD when the exact date is clear.
- If only a month/year or year is available, keep the original text in value and explain the limitation in notes.
- Approval date is the date the policy was formally approved, not necessarily the effective date.
- Next review date is the future review date, not the last review date.
- Review cycle is a period such as "3 years", "2 years", "annual", or "every 3 to 4 years".
- Approvers are people or bodies that formally approved, authorised, or endorsed the policy.
- Policy owner/custodian/responsible area is not necessarily the approver.
- Always provide sourceText and pageNumber for each extracted field where possible.
- Use confidence from 0 to 1.
- Do not create warnings based on an assumed current year. Use the current date supplied above.

Return JSON matching this shape:
{
  "title": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "documentId": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "version": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "status": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "approvalDate": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "effectiveDate": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "nextReviewDate": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "reviewCycle": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "policyOwner": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "responsibleArea": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "approvers": [
    {
      "name": string | null,
      "role": string | null,
      "evidence": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null }
    }
  ],
  "extractedWarnings": string[],
  "overallConfidence": number
}

Candidate page images supplied: ${images.map((image) => image.pageNumber).join(", ") || "none"}

Candidate page text:
${sections.map(formatSection).join("\n\n---\n\n")}
`.trim();
}

export function buildRepairPrompt(rawOutput: string, validationError: string): string {
  return `
The previous output was invalid for the required JSON schema.

Validation error:
${validationError}

Previous output:
${rawOutput}

Return corrected strict JSON only. No markdown. No commentary. Do not add facts that were not present in the previous output.
`.trim();
}

function formatSection(section: CandidateSection): string {
  const tableText = section.tables?.length ? `\nTables:\n${section.tables.map((table) => table.markdown).join("\n\n")}` : "";
  return `Page ${section.pageNumber} (score ${section.score}; reason: ${section.reason})\n${section.text}${tableText}`;
}
