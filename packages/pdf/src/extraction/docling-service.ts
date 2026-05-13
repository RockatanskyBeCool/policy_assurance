import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParsedDocument, ParsedPage, ParsedTable } from "./types.js";
import { fileExists, writeJson } from "./file-utils.js";

export interface DoclingService {
  parsePdf(inputPdfPath: string, outputDir: string): Promise<ParsedDocument>;
}

export class CliDoclingService implements DoclingService {
  async parsePdf(inputPdfPath: string, outputDir: string): Promise<ParsedDocument> {
    await fs.mkdir(outputDir, { recursive: true });
    const diagnostics: Record<string, unknown> = {};
    const doclingCommand = await findCommand("docling", [path.resolve(process.cwd(), "../../.venv-docling/bin/docling"), path.resolve(process.cwd(), ".venv-docling/bin/docling")]);
    if (doclingCommand) {
      try {
        await execa(doclingCommand, [inputPdfPath, "--to", "json", "--output", outputDir], { reject: true });
        const parsed = await parseDoclingOutput(inputPdfPath, outputDir);
        if (parsed) {
          parsed.diagnostics = { ...parsed.diagnostics, parser: "docling", doclingCommand };
          await writeJson(path.join(outputDir, "normalized-parsed-document.json"), parsed);
          return parsed;
        }
        diagnostics.doclingWarning = "Docling completed but no supported JSON output was found";
      } catch (error) {
        diagnostics.doclingError = error instanceof Error ? error.message : String(error);
      }
    } else {
      diagnostics.doclingWarning = "Docling CLI not available; used pdfjs-dist fallback";
    }

    const parsed = await parseWithPdfJs(inputPdfPath, diagnostics);
    await writeJson(path.join(outputDir, "normalized-parsed-document.json"), parsed);
    return parsed;
  }
}

async function findCommand(command: string, alternates: string[] = []): Promise<string | undefined> {
  for (const alternate of alternates) {
    if (await fileExists(alternate)) return alternate;
  }
  try {
    const result = await execa("sh", ["-lc", `command -v ${command}`], { reject: false });
    return result.exitCode === 0 ? result.stdout.trim() || command : undefined;
  } catch {
    return undefined;
  }
}

async function parseDoclingOutput(inputPdfPath: string, outputDir: string): Promise<ParsedDocument | undefined> {
  const entries = await fs.readdir(outputDir, { recursive: true });
  const jsonFile = entries.find((entry) => entry.toString().endsWith(".json"));
  if (!jsonFile) return undefined;
  const raw = JSON.parse(await fs.readFile(path.join(outputDir, jsonFile.toString()), "utf8")) as Record<string, unknown>;
  const markdown = typeof raw.markdown === "string" ? raw.markdown : undefined;
  const pages = extractDoclingPages(raw);
  return {
    sourceFile: inputPdfPath,
    pageCount: pages.length,
    pages,
    fullText: pages.map((page) => page.text).join("\n\n"),
    tables: pages.flatMap((page) => page.tables ?? []),
    metadata: raw.metadata as Record<string, unknown> | undefined,
    diagnostics: { parser: "docling", doclingJsonFile: jsonFile, markdownAvailable: Boolean(markdown) }
  };
}

function extractDoclingPages(raw: Record<string, unknown>): ParsedPage[] {
  const pagesValue = raw.pages;
  if (Array.isArray(pagesValue)) {
    return pagesValue.map((page, index) => {
      const record = page as Record<string, unknown>;
      const pageNumber = Number(record.page_no ?? record.pageNumber ?? index + 1);
      const text = String(record.text ?? record.markdown ?? "");
      return {
        pageNumber,
        text,
        markdown: typeof record.markdown === "string" ? record.markdown : undefined,
        tables: extractTablesFromRecord(record, pageNumber)
      };
    });
  }

  if (pagesValue && typeof pagesValue === "object") {
    return extractDoclingDocumentPages(raw, pagesValue as Record<string, unknown>);
  }

  const texts = typeof raw.text === "string" ? splitTextIntoPseudoPages(raw.text) : [];
  return texts.map((text, index) => ({ pageNumber: index + 1, text, tables: [] }));
}

function extractDoclingDocumentPages(raw: Record<string, unknown>, pagesRecord: Record<string, unknown>): ParsedPage[] {
  const pageNumbers = Object.keys(pagesRecord)
    .map((key) => Number(key))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
  const textsByPage = new Map<number, string[]>();
  const tablesByPage = new Map<number, ParsedTable[]>();

  for (const textItem of asRecordArray(raw.texts)) {
    const pageNumber = firstPageNumber(textItem);
    const text = typeof textItem.text === "string" ? textItem.text : typeof textItem.orig === "string" ? textItem.orig : "";
    if (!pageNumber || !text.trim()) continue;
    const values = textsByPage.get(pageNumber) ?? [];
    values.push(text.trim());
    textsByPage.set(pageNumber, values);
  }

  for (const [index, tableItem] of asRecordArray(raw.tables).entries()) {
    const pageNumber = firstPageNumber(tableItem);
    if (!pageNumber) continue;
    const table = parseDoclingTable(tableItem, pageNumber, index + 1);
    const values = tablesByPage.get(pageNumber) ?? [];
    values.push(table);
    tablesByPage.set(pageNumber, values);
  }

  return pageNumbers.map((pageNumber) => {
    const tables = tablesByPage.get(pageNumber) ?? [];
    return {
      pageNumber,
      text: [...(textsByPage.get(pageNumber) ?? []), ...tables.map((table) => table.markdown)].join("\n").trim(),
      tables
    };
  });
}

function parseDoclingTable(record: Record<string, unknown>, pageNumber: number, index: number): ParsedTable {
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const cells = asRecordArray(data.table_cells);
  const maxRow = Math.max(0, ...cells.map((cell) => Number(cell.start_row_offset_idx ?? 0)));
  const maxCol = Math.max(0, ...cells.map((cell) => Number(cell.start_col_offset_idx ?? 0)));
  const rows = Array.from({ length: maxRow + 1 }, () => Array.from({ length: maxCol + 1 }, () => ""));
  for (const cell of cells) {
    const row = Number(cell.start_row_offset_idx ?? 0);
    const col = Number(cell.start_col_offset_idx ?? 0);
    rows[row][col] = typeof cell.text === "string" ? cell.text : "";
  }
  const markdown = rows.map((row) => row.join(" | ")).join("\n");
  return {
    pageNumber,
    caption: `Table ${index}`,
    rows,
    markdown
  };
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function firstPageNumber(record: Record<string, unknown>): number | undefined {
  const prov = asRecordArray(record.prov);
  const pageNo = prov[0]?.page_no;
  return typeof pageNo === "number" ? pageNo : undefined;
}

function extractTablesFromRecord(record: Record<string, unknown>, pageNumber: number): ParsedTable[] {
  const tables = record.tables;
  if (!Array.isArray(tables)) return [];
  return tables.map((table, index) => {
    const tableRecord = table as Record<string, unknown>;
    const rows = Array.isArray(tableRecord.rows) ? (tableRecord.rows as string[][]) : [];
    const markdown = typeof tableRecord.markdown === "string" ? tableRecord.markdown : rows.map((row) => row.join(" | ")).join("\n");
    return { pageNumber, caption: `Table ${index + 1}`, rows, markdown };
  });
}

function splitTextIntoPseudoPages(text: string): string[] {
  return text.split(/\n\s*---+\s*\n/).filter(Boolean);
}

async function parseWithPdfJs(inputPdfPath: string, diagnostics: Record<string, unknown>): Promise<ParsedDocument> {
  const bytes = new Uint8Array(await fs.readFile(inputPdfPath));
  const loadingTask = pdfjsLib.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: ParsedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber, text, tables: [] });
  }

  return {
    sourceFile: inputPdfPath,
    pageCount: pdf.numPages,
    pages,
    fullText: pages.map((page) => `Page ${page.pageNumber}\n${page.text}`).join("\n\n"),
    tables: [],
    diagnostics: { ...diagnostics, parser: "pdfjs-dist" }
  };
}

export async function hasDoclingOutput(outputDir: string): Promise<boolean> {
  return fileExists(path.join(outputDir, "normalized-parsed-document.json"));
}
