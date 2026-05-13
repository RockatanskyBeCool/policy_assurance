import { endOfMonth, format, isValid, parse } from "date-fns";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_YEAR = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}$/i;
const YEAR_ONLY = /^\d{4}$/;

export interface DateNormalizationResult {
  value: string | null;
  warning?: string;
}

export function normalizeDate(value: string | null, locale = "en-AU"): DateNormalizationResult {
  if (!value) return { value: null };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  const cleaned = trimmed
    .replace(/\b(\d{1,2})\s*(st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");

  if (ISO_DATE.test(cleaned)) {
    const date = parse(cleaned, "yyyy-MM-dd", new Date());
    return isValid(date) ? { value: cleaned } : { value: null, warning: `Invalid ISO date: ${trimmed}` };
  }

  if (MONTH_YEAR.test(cleaned) || YEAR_ONLY.test(cleaned)) {
    if (MONTH_YEAR.test(cleaned)) {
      const parsed = parse(cleaned, "MMMM yyyy", new Date());
      if (isValid(parsed)) {
        return {
          value: format(endOfMonth(parsed), "yyyy-MM-dd"),
          warning: `Partial month/year date defaulted to last day of month: ${trimmed}`
        };
      }
    }
    return { value: null, warning: `Partial date preserved as raw text: ${trimmed}` };
  }

  const yearMonth = parseYearMonth(cleaned);
  if (yearMonth) {
    return {
      value: format(endOfMonth(yearMonth), "yyyy-MM-dd"),
      warning: `Partial year/month date defaulted to last day of month: ${trimmed}`
    };
  }

  const formats = [
    "d MMMM yyyy",
    "dd MMMM yyyy",
    "d MMM yyyy",
    "dd MMM yyyy",
    "yyyy/MM/dd",
    "yyyy.MM.dd",
    locale === "en-AU" ? "d/M/yyyy" : "M/d/yyyy",
    locale === "en-AU" ? "dd/MM/yyyy" : "MM/dd/yyyy",
    locale === "en-AU" ? "d-M-yyyy" : "M-d-yyyy",
    locale === "en-AU" ? "dd-MM-yyyy" : "MM-dd-yyyy"
  ];

  for (const candidateFormat of formats) {
    const parsed = parse(cleaned, candidateFormat, new Date());
    if (isValid(parsed) && format(parsed, candidateFormat) === normalizeFormatEcho(cleaned, candidateFormat, parsed)) {
      const slashAmbiguous = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(cleaned) && isAmbiguousNumericDate(cleaned);
      return {
        value: format(parsed, "yyyy-MM-dd"),
        warning: slashAmbiguous ? `Ambiguous numeric date interpreted as ${locale}: ${trimmed}` : undefined
      };
    }
  }

  return { value: null, warning: `Could not safely normalize date: ${trimmed}` };
}

function normalizeFormatEcho(original: string, candidateFormat: string, parsed: Date): string {
  if (/[A-Za-z]/.test(original)) return format(parsed, candidateFormat);
  return original
    .split(/([/.-])/)
    .map((part) => (/^\d$/.test(part) ? `0${part}` : part))
    .join("");
}

function isAmbiguousNumericDate(value: string): boolean {
  const [first, second] = value.split(/[/-]/).map((part) => Number(part));
  return Boolean(first && second && first <= 12 && second <= 12);
}

function parseYearMonth(value: string): Date | undefined {
  const match = /^(\d{4})[-/.](\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return undefined;
  return new Date(Date.UTC(year, month - 1, 1));
}
