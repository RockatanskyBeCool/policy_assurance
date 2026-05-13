export interface ExtractedDate {
  label: string;
  raw: string;
  confidence: number;
}

const dateLabelPattern = /(review(?:ed)?|next review|approved|ratified|endorsed|date approved|version)\s*(?:date)?\s*[:\-]?\s*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:20)?\d{2}|[A-Z][a-z]+\s+20\d{2}|20\d{2})/gi;

export function extractPolicyDates(text: string): ExtractedDate[] {
  const dates: ExtractedDate[] = [];
  for (const match of text.matchAll(dateLabelPattern)) {
    dates.push({
      label: match[1].toLowerCase(),
      raw: match[2],
      confidence: 0.8
    });
  }
  return dates;
}

export function detectLikelyTitle(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 8 && line.length < 120 && /policy/i.test(line));
}

export * from "./extraction/schemas.js";
export * from "./extraction/types.js";
export * from "./extraction/policy-extraction-pipeline-service.js";
export * from "./extraction/candidate-detection-service.js";
export * from "./extraction/date-utils.js";
export * from "./extraction/json-repair-service.js";
export * from "./extraction/validation-service.js";
