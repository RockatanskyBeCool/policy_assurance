import { jsonrepair } from "jsonrepair";

export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectText = extractLargestJsonObject(trimmed);
    const repaired = jsonrepair(objectText ?? trimmed);
    return JSON.parse(repaired);
  }
}

function extractLargestJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return value.slice(start, end + 1);
}
