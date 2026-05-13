import "dotenv/config";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@school-policy/db";
import { extractAndPersistPolicyMetadata } from "./policy-extraction-db.js";

const args = parseArgs(process.argv.slice(2));
const pdfUrl = stringArg(args, "pdf-url") ?? args._[0];

if (!pdfUrl) {
  console.error("Usage: npm run extract:policy:db -- --pdf-url <discovered-pdf-url>");
  process.exit(1);
}

const db = createDb();
const storageRoot = path.resolve(process.env.OBJECT_STORAGE_ROOT ?? "./storage");

const [pdf] = await db.select().from(schema.discoveredPdfs).where(eq(schema.discoveredPdfs.pdfUrl, pdfUrl));
if (!pdf) {
  throw new Error(`No discovered_pdf row found for URL: ${pdfUrl}`);
}

const persisted = await extractAndPersistPolicyMetadata({ db, discoveredPdf: pdf, storageRoot });

console.log(
  JSON.stringify(
    {
      pdfExtractionId: persisted.pdfExtractionId,
      discoveredPdfId: pdf.id,
      schoolId: pdf.schoolId,
      pdfUrl: pdf.pdfUrl,
      structuredJsonUri: persisted.structuredJsonUri,
      detectedTitle: persisted.detectedTitle,
      detectedApprovalDate: persisted.detectedApprovalDate,
      detectedNextReviewDate: persisted.detectedNextReviewDate,
      extractionConfidence: persisted.extractionConfidence,
      requiresHumanReview: persisted.requiresHumanReview
    },
    null,
    2
  )
);

function parseArgs(values: string[]): Record<string, string | boolean | string[]> & { _: string[] } {
  const parsed: Record<string, string | boolean | string[]> & { _: string[] } = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}
