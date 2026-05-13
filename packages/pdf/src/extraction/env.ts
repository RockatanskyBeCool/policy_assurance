import path from "node:path";
import { z } from "zod";
import { loadWorkspaceEnv } from "./load-env.js";

loadWorkspaceEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  ALIBABA_API_KEY: z.string().optional(),
  ALIBABA_BASE_URL: z.string().url().default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
  QWEN_VL_MODEL: z.string().default("qwen3-vl-32b-instruct"),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
  MAX_CANDIDATE_PAGES: z.coerce.number().default(10),
  RASTER_DPI: z.coerce.number().default(180),
  MIN_OVERALL_CONFIDENCE: z.coerce.number().default(0.75),
  MIN_CRITICAL_FIELD_CONFIDENCE: z.coerce.number().default(0.65),
  MAX_EXTRACTION_ATTEMPTS: z.coerce.number().default(4)
});

export type ExtractionEnv = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);

export function resolvedDataDir(dataDir = env.DATA_DIR): string {
  return path.resolve(process.cwd(), dataDir);
}
