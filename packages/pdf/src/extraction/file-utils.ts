import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

export interface IngestedDocument {
  jobId: string;
  originalFilename: string;
  localPdfPath: string;
  jobDir: string;
  createdAt: string;
  contentHash: string;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document.pdf";
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

export function sha256(buffer: Buffer | Uint8Array | string): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function ingestPdf(input: string, dataDir: string, maxUploadMb: number): Promise<IngestedDocument> {
  const jobId = nanoid();
  const jobDir = path.join(dataDir, "jobs", jobId);
  const originalFilename = sanitizeFilename(path.basename(input));
  const localPdfPath = path.join(jobDir, "input.pdf");
  await ensureDir(jobDir);

  let bytes: Buffer;
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("pdf") && !input.toLowerCase().includes(".pdf")) {
      throw new Error(`URL did not look like a PDF. content-type=${contentType}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    bytes = await fs.readFile(input);
  }

  const maxBytes = maxUploadMb * 1024 * 1024;
  if (bytes.byteLength > maxBytes) {
    throw new Error(`PDF exceeds max size of ${maxUploadMb}MB`);
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Input is not a PDF file");
  }

  await fs.writeFile(localPdfPath, bytes);
  return {
    jobId,
    originalFilename,
    localPdfPath,
    jobDir,
    createdAt: new Date().toISOString(),
    contentHash: sha256(bytes)
  };
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
