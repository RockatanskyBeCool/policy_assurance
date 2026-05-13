import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type { PageImageRef } from "./types.js";
import { ensureDir } from "./file-utils.js";

export interface RasterResult {
  images: PageImageRef[];
  diagnostics: Record<string, unknown>;
}

export async function rasterizePages(inputPdfPath: string, pageNumbers: number[], outputDir: string, dpi: number): Promise<RasterResult> {
  await ensureDir(outputDir);
  const available = await commandExists("pdftoppm");
  if (!available) {
    return {
      images: [],
      diagnostics: {
        rasterizer: "pdftoppm",
        rasterWarning: "pdftoppm not available; Qwen extraction will use text context only"
      }
    };
  }

  const images: PageImageRef[] = [];
  const diagnostics: Record<string, unknown> = { rasterizer: "pdftoppm", dpi };

  for (const pageNumber of pageNumbers) {
    const prefix = path.join(outputDir, `page-${String(pageNumber).padStart(3, "0")}`);
    await execa("pdftoppm", ["-png", "-r", String(dpi), "-f", String(pageNumber), "-l", String(pageNumber), inputPdfPath, prefix], {
      reject: true
    });
    const generated = `${prefix}-${pageNumber}.png`;
    const normalized = path.join(outputDir, `page-${String(pageNumber).padStart(3, "0")}.png`);
    if (await exists(normalized)) {
      images.push({ pageNumber, path: normalized, mimeType: "image/png" });
      continue;
    }
    if (await exists(generated)) {
      await fs.rename(generated, normalized);
      images.push({ pageNumber, path: normalized, mimeType: "image/png" });
      continue;
    }

    // Some pdftoppm versions omit the page suffix for single page ranges.
    const alternate = `${prefix}.png`;
    if (await exists(alternate) && alternate !== normalized) {
      await fs.rename(alternate, normalized);
    }
    if (!(await exists(normalized))) {
      const produced = await findProducedImage(outputDir, path.basename(prefix));
      if (produced && produced !== normalized) {
        await fs.rename(produced, normalized);
      }
    }
    if (!(await exists(normalized))) {
      throw new Error(`pdftoppm did not produce an image for page ${pageNumber}`);
    }
    images.push({ pageNumber, path: normalized, mimeType: "image/png" });
  }

  return { images, diagnostics };
}

async function findProducedImage(outputDir: string, prefixBase: string): Promise<string | undefined> {
  const entries = await fs.readdir(outputDir);
  const match = entries.find((entry) => entry.startsWith(`${prefixBase}-`) && entry.endsWith(".png"));
  return match ? path.join(outputDir, match) : undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await execa("sh", ["-lc", `command -v ${command}`], { reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
