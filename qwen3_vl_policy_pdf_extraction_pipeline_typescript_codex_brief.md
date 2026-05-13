# Codex Build Brief: TypeScript Policy PDF Metadata Extraction Pipeline

## 1. Objective

Build a TypeScript-first document extraction pipeline that ingests messy policy PDF documents and returns validated structured metadata as JSON.

The pipeline should extract governance and policy metadata such as:

- Policy title
- Document ID / policy number
- Version
- Approval date
- Effective date
- Next review date
- Review cycle
- Approver names
- Approver roles
- Policy owner / custodian
- Responsible area / department
- Status
- Source evidence for each extracted field
- Confidence score and notes

The source PDFs will be inconsistent. They may have different templates, different field names, different layouts, and metadata spread across title pages, document control tables, approval sections, revision history tables, headers, footers, and appendices.

This is not a simple OCR pipeline. It is a messy enterprise document understanding and semantic extraction pipeline.

---

## 2. Core Architecture

The previous Python-oriented concept was:

```text
Docling
+
Qwen3-VL-32B-Instruct
+
Pydantic validation
+
retry pipeline
```

For the TypeScript application, implement the equivalent as:

```text
PDF upload / file input
  ↓
TypeScript orchestration service
  ↓
Docling sidecar or CLI wrapper
  ↓
Candidate metadata page / section detection
  ↓
Qwen3-VL-32B-Instruct via Alibaba Cloud OpenAI-compatible API
  ↓
Zod validation instead of Pydantic
  ↓
Retry / repair / confidence pipeline
  ↓
Final normalized JSON output
```

Important architectural change:

- Do **not** use Pydantic.
- Use **Zod** for runtime validation and TypeScript type inference.
- Keep the application orchestration in TypeScript.
- Use Docling as either:
  - a Python CLI invoked from Node.js, or
  - a Docker sidecar service, or
  - a separate internal parsing microservice.

The recommended implementation is a Docker sidecar or CLI wrapper, because Docling itself is Python-native but can still fit cleanly into a TypeScript architecture.

---

## 3. Recommended Technology Stack

### Application Runtime

Use:

- Node.js 20+
- TypeScript
- pnpm or npm
- Express, Fastify, or existing app framework
- Zod for schema validation
- `openai` npm package for Alibaba Cloud OpenAI-compatible calls
- `pdf-lib` or `pdfjs-dist` for lightweight PDF inspection if needed
- `sharp` or ImageMagick/Poppler CLI for page rasterisation when image input is required
- `execa` for calling Docling CLI or other subprocesses
- `p-limit` for concurrency control
- `p-retry` or custom retry logic
- `nanoid` or UUIDs for job IDs
- structured logging with `pino`

### Document Parser

Use Docling for structural PDF parsing.

Expected Docling output should be converted into a normalized internal representation, for example:

```ts
export interface ParsedDocument {
  sourceFile: string;
  pageCount: number;
  pages: ParsedPage[];
  fullText: string;
  tables: ParsedTable[];
  metadata?: Record<string, unknown>;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  markdown?: string;
  tables?: ParsedTable[];
  images?: PageImageRef[];
}

export interface ParsedTable {
  pageNumber: number;
  caption?: string;
  rows: string[][];
  markdown: string;
}

export interface PageImageRef {
  pageNumber: number;
  path: string;
  mimeType: 'image/png' | 'image/jpeg';
}
```

### Model

Use Alibaba Cloud Model Studio OpenAI-compatible API with:

```text
model: qwen3-vl-32b-instruct
```

Use the non-thinking Instruct model for this extraction task. It should be more deterministic than a reasoning/thinking variant for schema-constrained extraction.

The Alibaba Cloud OpenAI-compatible endpoint should be configurable via environment variables.

Example environment variables:

```bash
ALIBABA_API_KEY=your_api_key_here
ALIBABA_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_VL_MODEL=qwen3-vl-32b-instruct
```

Confirm the exact base URL for the account region being used. Do not hardcode the endpoint in business logic.

---

## 4. Target Output JSON Schema

Implement the schema with Zod.

Create `src/schemas/policyMetadata.schema.ts`:

```ts
import { z } from 'zod';

export const EvidenceSchema = z.object({
  value: z.string().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  sourceText: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable().optional(),
});

export const PersonRoleSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  evidence: EvidenceSchema.optional(),
});

export const PolicyMetadataSchema = z.object({
  title: EvidenceSchema,
  documentId: EvidenceSchema,
  version: EvidenceSchema,
  status: EvidenceSchema,
  approvalDate: EvidenceSchema,
  effectiveDate: EvidenceSchema,
  nextReviewDate: EvidenceSchema,
  reviewCycle: EvidenceSchema,
  policyOwner: EvidenceSchema,
  responsibleArea: EvidenceSchema,
  approvers: z.array(PersonRoleSchema),
  extractedWarnings: z.array(z.string()),
  overallConfidence: z.number().min(0).max(1),
});

export type PolicyMetadata = z.infer<typeof PolicyMetadataSchema>;
```

Notes:

- Dates should initially be returned as strings in ISO `YYYY-MM-DD` format where possible.
- If a date is ambiguous, set the value to `null` and explain the ambiguity in `notes` or `extractedWarnings`.
- Do not invent missing fields.
- Always include evidence for extracted values.
- The model should not only return values; it should cite the source text and page number used.

---

## 5. Pipeline Stages

### Stage 1: Ingest PDF

Create an ingestion service that accepts either:

- local file path
- uploaded file buffer
- object storage key

Suggested interface:

```ts
export interface IngestedDocument {
  jobId: string;
  originalFilename: string;
  localPdfPath: string;
  createdAt: string;
}
```

Validation requirements:

- Accept PDF only.
- Enforce max file size.
- Store uploads in a temporary job folder.
- Sanitize file names.
- Never trust the original file name as a safe path.

Suggested folder layout:

```text
data/
  jobs/
    {jobId}/
      input.pdf
      docling-output.json
      pages/
        page-001.png
        page-002.png
      extraction-attempt-1.json
      extraction-attempt-2.json
      final.json
```

---

### Stage 2: Parse with Docling

Implement a wrapper around Docling.

Suggested file:

```text
src/services/docling.service.ts
```

Suggested interface:

```ts
export interface DoclingService {
  parsePdf(inputPdfPath: string, outputDir: string): Promise<ParsedDocument>;
}
```

Implementation options:

#### Option A: CLI wrapper

Use `execa` to call Docling from TypeScript.

Example skeleton:

```ts
import { execa } from 'execa';

export async function runDocling(inputPdfPath: string, outputDir: string) {
  await execa('docling', [
    inputPdfPath,
    '--to', 'json',
    '--output', outputDir,
  ], {
    reject: true,
  });
}
```

Codex should verify the actual Docling CLI command and output format during implementation.

#### Option B: Docker sidecar

Run Docling in a separate container and communicate through:

- shared volume, or
- HTTP API wrapper, or
- job queue.

This may be cleaner for deployment because the main app remains TypeScript-only.

Recommended Docker Compose shape:

```yaml
services:
  app:
    build: .
    env_file: .env
    volumes:
      - ./data:/app/data
    depends_on:
      - docling

  docling:
    image: your-docling-wrapper-image
    volumes:
      - ./data:/data
```

For the first build, the CLI wrapper is acceptable if the runtime image includes Python and Docling. For a cleaner production deployment, prefer the sidecar approach.

---

### Stage 3: Candidate Metadata Detection

Do not send every page blindly to Qwen3-VL.

First identify likely metadata-bearing pages and sections using deterministic heuristics against the Docling output.

Create:

```text
src/services/candidateDetection.service.ts
```

Search for terms like:

```text
policy
procedure
document control
approval
approved by
approved on
approver
authorised by
authorized by
endorsed by
responsible officer
policy owner
custodian
version
version history
revision history
effective date
commencement date
next review
review date
scheduled review
review cycle
status
```

Produce:

```ts
export interface CandidateSection {
  pageNumber: number;
  reason: string;
  text: string;
  markdown?: string;
  tables?: ParsedTable[];
  score: number;
}
```

Selection rules:

- Always include page 1.
- Always include pages with document control tables.
- Always include pages with approval/review/version keywords.
- Include pages with strong table density and governance terms.
- Include the last page if it contains approval/signature/footer metadata.
- Limit initial extraction to the top 5-10 candidate pages unless the document is very short.

---

### Stage 4: Optional Page Rasterisation for Vision Input

Qwen3-VL can receive image content. Use image inputs when:

- Docling text extraction is sparse or poor.
- The page appears scanned.
- Tables are malformed.
- Approval/signature blocks are visual.
- Headers/footers are important.

Generate PNGs for candidate pages only.

Suggested service:

```text
src/services/pdfRaster.service.ts
```

Use one of:

- Poppler `pdftoppm`
- ImageMagick
- `pdfjs-dist` plus canvas

Recommended simple production approach:

```bash
pdftoppm -png -r 180 input.pdf page
```

Store images as:

```text
page-001.png
page-002.png
```

Avoid excessively high DPI unless required. Start with 180 DPI and increase only for poor scans.

---

### Stage 5: Qwen3-VL Extraction

Create:

```text
src/services/qwenExtraction.service.ts
```

Use the `openai` npm package against Alibaba Cloud's OpenAI-compatible endpoint.

Example skeleton:

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ALIBABA_API_KEY,
  baseURL: process.env.ALIBABA_BASE_URL,
});

export async function callQwenForExtraction(payload: unknown) {
  const response = await client.chat.completions.create({
    model: process.env.QWEN_VL_MODEL ?? 'qwen3-vl-32b-instruct',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'You extract policy metadata from messy policy PDF documents. Return strict JSON only. Do not invent missing values.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildExtractionPrompt(payload),
          },
          // optionally include page images here when available
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content;
}
```

Image input pattern:

```ts
{
  type: 'image_url',
  image_url: {
    url: `data:image/png;base64,${base64Image}`,
  },
}
```

Codex must confirm the exact image message format supported by Alibaba Cloud's OpenAI-compatible Qwen-VL endpoint. The expected format is OpenAI-compatible multimodal chat completion content.

---

## 6. Extraction Prompt Requirements

Create:

```text
src/prompts/policyExtraction.prompt.ts
```

The prompt should instruct the model to:

- return strict JSON only
- use `null` for unknown values
- avoid guessing
- normalize dates to ISO `YYYY-MM-DD` where possible
- preserve source evidence
- identify ambiguous fields
- distinguish between approval date, effective date, next review date, review cycle, and version date
- capture approver names separately from roles
- include confidence per field
- include page numbers

Prompt draft:

```text
You are extracting governance metadata from a university or enterprise policy document.

The document may be messy, inconsistently formatted, scanned, or use inconsistent terminology.

Return STRICT JSON only. No markdown. No commentary.

Rules:
- Do not invent missing values.
- If a field is not present, set value to null.
- If a field is ambiguous, set value to null unless the evidence is strong.
- Normalize dates to YYYY-MM-DD when the exact date is clear.
- If only a month/year or year is available, keep the original text in value and explain the limitation in notes.
- Approval date is the date the policy was formally approved, not necessarily the effective date.
- Next review date is the future review date, not the last review date.
- Review cycle is a period such as "3 years" or "annual".
- Approvers are people or bodies that formally approved/authorised/endorsed the policy.
- Policy owner/custodian is not necessarily the approver.
- Always provide sourceText and pageNumber for each extracted field where possible.
- Use confidence from 0 to 1.

Return JSON matching this schema shape:
{
  "title": { "value": string | null, "pageNumber": number | null, "sourceText": string | null, "confidence": number, "notes": string | null },
  "documentId": { ... },
  "version": { ... },
  "status": { ... },
  "approvalDate": { ... },
  "effectiveDate": { ... },
  "nextReviewDate": { ... },
  "reviewCycle": { ... },
  "policyOwner": { ... },
  "responsibleArea": { ... },
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
```

---

## 7. JSON Parsing and Repair

Model output may contain malformed JSON.

Create:

```text
src/services/jsonRepair.service.ts
```

Strategy:

1. Try `JSON.parse` directly.
2. If parsing fails, extract the largest JSON object substring.
3. Try a tolerant parser such as `jsonrepair`.
4. Validate with Zod.
5. If still invalid, call the model again with a repair prompt.

Recommended package:

```bash
npm install jsonrepair
```

Example:

```ts
import { jsonrepair } from 'jsonrepair';

export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}
```

---

## 8. Zod Validation and Normalisation

Create:

```text
src/services/validation.service.ts
```

Responsibilities:

- Validate model output using `PolicyMetadataSchema`.
- Normalize empty strings to `null`.
- Normalize dates where possible.
- Flag impossible dates.
- Flag next review dates before approval dates.
- Flag effective dates that predate approval date only as a warning, not hard failure, because some policies may operate retrospectively.
- Remove duplicate approvers.
- Ensure confidence values are within 0-1.

Suggested date normalization helper:

```ts
export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  // Implement conservative parsing only.
  // Prefer exact day-month-year formats.
  // Avoid guessing between AU and US date formats unless context is clear.
  return value;
}
```

For Australian university documents, prefer Australian date interpretation for slash dates unless otherwise configured:

```text
DD/MM/YYYY
```

But ambiguous values such as `05/06/2024` should produce a warning unless locale configuration explicitly says `en-AU`.

---

## 9. Retry Pipeline

Create:

```text
src/services/extractionRetry.service.ts
```

Retries should not simply repeat the same prompt.

Implement structured retry types:

### Attempt 1: Standard extraction

Use candidate text plus selected page images if needed.

### Attempt 2: Validation repair

If JSON is invalid or schema validation fails, send:

- original raw output
- validation error summary
- target schema

Ask the model to return corrected JSON only.

### Attempt 3: Focused missing field extraction

If required fields are missing or low confidence, search more pages and ask targeted questions:

- “Find the approval date.”
- “Find the next review date.”
- “Find the policy owner or custodian.”
- “Find approvers or approval body.”

### Attempt 4: Expanded context extraction

Include more candidate pages or the whole Docling markdown text if the document is short enough.

### Stop conditions

Stop when:

- Zod schema validates successfully, and
- minimum confidence threshold is met, or
- max attempts reached.

Suggested thresholds:

```ts
const MIN_OVERALL_CONFIDENCE = 0.75;
const MIN_CRITICAL_FIELD_CONFIDENCE = 0.65;
```

Critical fields:

- title
- version
- approvalDate
- nextReviewDate
- policyOwner
- approvers

Do not force every document to contain every field. Missing values should be allowed, but the system should flag incomplete extraction.

---

## 10. Confidence Scoring

The model should provide confidence, but the application should also calculate a derived confidence score.

Create:

```text
src/services/confidence.service.ts
```

Derived confidence should consider:

- Model confidence
- Presence of source evidence
- Page number availability
- Whether source text contains a matching label
- Date parse quality
- Whether multiple conflicting values were found
- Whether a value came from a focused retry

Example output:

```ts
export interface ExtractionQualityReport {
  overallConfidence: number;
  criticalMissingFields: string[];
  lowConfidenceFields: string[];
  conflicts: string[];
  warnings: string[];
  requiresHumanReview: boolean;
}
```

Human review should be required if:

- overall confidence < 0.75
- approval date is missing
- next review date is missing
- approver data is missing or ambiguous
- conflicting versions are found
- the PDF appears scanned and OCR quality is poor

---

## 11. Public API Design

Implement service-level methods first. A REST API can be added after.

Suggested main interface:

```ts
export interface ExtractionResult {
  jobId: string;
  metadata: PolicyMetadata;
  quality: ExtractionQualityReport;
  attempts: ExtractionAttemptSummary[];
  outputPath: string;
}

export async function extractPolicyMetadataFromPdf(inputPdfPath: string): Promise<ExtractionResult>;
```

Suggested REST endpoints:

```text
POST /api/policy-extractions
GET  /api/policy-extractions/:jobId
GET  /api/policy-extractions/:jobId/final.json
```

For the first implementation, a CLI entry point is enough:

```bash
npm run extract -- ./examples/policy.pdf
```

---

## 12. Suggested Project Structure

```text
src/
  index.ts
  cli.ts
  config/
    env.ts
  schemas/
    policyMetadata.schema.ts
  types/
    parsedDocument.types.ts
    extraction.types.ts
  services/
    ingest.service.ts
    docling.service.ts
    candidateDetection.service.ts
    pdfRaster.service.ts
    qwenExtraction.service.ts
    jsonRepair.service.ts
    validation.service.ts
    extractionRetry.service.ts
    confidence.service.ts
    policyExtractionPipeline.service.ts
  prompts/
    policyExtraction.prompt.ts
    jsonRepair.prompt.ts
    focusedExtraction.prompt.ts
  utils/
    file.utils.ts
    date.utils.ts
    logger.ts
  tests/
    fixtures/
    policyMetadata.schema.test.ts
    candidateDetection.service.test.ts
    validation.service.test.ts
    jsonRepair.service.test.ts
```

---

## 13. Environment Configuration

Create `.env.example`:

```bash
NODE_ENV=development
LOG_LEVEL=debug

ALIBABA_API_KEY=
ALIBABA_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_VL_MODEL=qwen3-vl-32b-instruct

DATA_DIR=./data
MAX_UPLOAD_MB=50
MAX_CANDIDATE_PAGES=10
RASTER_DPI=180

MIN_OVERALL_CONFIDENCE=0.75
MIN_CRITICAL_FIELD_CONFIDENCE=0.65
MAX_EXTRACTION_ATTEMPTS=4
```

Create `src/config/env.ts` using Zod:

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  ALIBABA_API_KEY: z.string().min(1),
  ALIBABA_BASE_URL: z.string().url(),
  QWEN_VL_MODEL: z.string().default('qwen3-vl-32b-instruct'),
  DATA_DIR: z.string().default('./data'),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
  MAX_CANDIDATE_PAGES: z.coerce.number().default(10),
  RASTER_DPI: z.coerce.number().default(180),
  MIN_OVERALL_CONFIDENCE: z.coerce.number().default(0.75),
  MIN_CRITICAL_FIELD_CONFIDENCE: z.coerce.number().default(0.65),
  MAX_EXTRACTION_ATTEMPTS: z.coerce.number().default(4),
});

export const env = EnvSchema.parse(process.env);
```

---

## 14. Dependency Installation

Suggested dependencies:

```bash
npm install openai zod execa pino pino-pretty jsonrepair nanoid p-limit
npm install -D typescript tsx vitest @types/node eslint prettier
```

Optional:

```bash
npm install date-fns
```

Only add `pdfjs-dist`, `sharp`, or other image/PDF packages if needed. Prefer Poppler CLI for rasterisation in the first implementation because it is simpler and reliable.

---

## 15. Example Final JSON Output

```json
{
  "title": {
    "value": "Student Assessment Policy",
    "pageNumber": 1,
    "sourceText": "Student Assessment Policy",
    "confidence": 0.98,
    "notes": null
  },
  "documentId": {
    "value": "MPF1326",
    "pageNumber": 1,
    "sourceText": "Policy ID: MPF1326",
    "confidence": 0.94,
    "notes": null
  },
  "version": {
    "value": "4.1",
    "pageNumber": 2,
    "sourceText": "Version 4.1 approved on 12 March 2024",
    "confidence": 0.87,
    "notes": null
  },
  "status": {
    "value": "Approved",
    "pageNumber": 1,
    "sourceText": "Status: Approved",
    "confidence": 0.9,
    "notes": null
  },
  "approvalDate": {
    "value": "2024-03-12",
    "pageNumber": 2,
    "sourceText": "Approved by Academic Board on 12 March 2024",
    "confidence": 0.93,
    "notes": null
  },
  "effectiveDate": {
    "value": "2024-04-01",
    "pageNumber": 2,
    "sourceText": "Effective from 1 April 2024",
    "confidence": 0.91,
    "notes": null
  },
  "nextReviewDate": {
    "value": "2027-03-12",
    "pageNumber": 2,
    "sourceText": "Next review: three years from approval",
    "confidence": 0.74,
    "notes": "Calculated from approval date and stated three-year review cycle."
  },
  "reviewCycle": {
    "value": "3 years",
    "pageNumber": 2,
    "sourceText": "Next review: three years from approval",
    "confidence": 0.84,
    "notes": null
  },
  "policyOwner": {
    "value": "Academic Registrar",
    "pageNumber": 1,
    "sourceText": "Policy owner: Academic Registrar",
    "confidence": 0.92,
    "notes": null
  },
  "responsibleArea": {
    "value": "Academic Services",
    "pageNumber": 1,
    "sourceText": "Responsible area: Academic Services",
    "confidence": 0.82,
    "notes": null
  },
  "approvers": [
    {
      "name": null,
      "role": "Academic Board",
      "evidence": {
        "value": "Approved by Academic Board on 12 March 2024",
        "pageNumber": 2,
        "sourceText": "Approved by Academic Board on 12 March 2024",
        "confidence": 0.91,
        "notes": "Approver is a governance body rather than an individual person."
      }
    }
  ],
  "extractedWarnings": [
    "Next review date was calculated from approval date and review cycle rather than explicitly stated as a calendar date."
  ],
  "overallConfidence": 0.86
}
```

---

## 16. Testing Requirements

Create tests for:

### Schema validation

- valid full extraction
- missing optional values
- invalid confidence values
- malformed approver arrays

### JSON repair

- raw JSON
- JSON inside markdown fence
- trailing commas
- prose before/after JSON

### Candidate detection

- page with document control table
- page with approval section
- page with version history
- irrelevant content page

### Date normalization

- `12 March 2024`
- `12/03/2024`
- `2024-03-12`
- ambiguous dates
- month/year only

### Retry logic

- invalid model output triggers repair attempt
- low confidence triggers focused extraction
- max attempts stops cleanly

Use Vitest.

---

## 17. Acceptance Criteria

The implementation is acceptable when:

1. A PDF can be passed to a TypeScript CLI command.
2. The system runs Docling and stores parsed output.
3. Candidate metadata sections are detected.
4. Qwen3-VL-32B-Instruct is called through the Alibaba Cloud OpenAI-compatible API.
5. The model returns JSON.
6. The JSON is repaired if needed.
7. The JSON is validated with Zod.
8. The retry pipeline handles malformed output and low-confidence extraction.
9. The final result is written to `final.json`.
10. The final result includes extracted metadata, evidence, confidence, warnings, and human-review flags.
11. The system does not crash on missing fields.
12. The system does not invent values when fields are absent.
13. Unit tests cover schema, parsing, candidate detection, date normalization, and retry behavior.

---

## 18. Implementation Order for Codex

Build in this order:

1. Project structure and TypeScript config
2. Environment config with Zod
3. Policy metadata Zod schema
4. Job folder and file utilities
5. Docling service stub/interface
6. Candidate detection service
7. Qwen extraction service
8. Prompt builder
9. JSON repair service
10. Validation and normalization service
11. Retry orchestration service
12. Main pipeline service
13. CLI entry point
14. Tests
15. Optional REST API
16. Optional Docker sidecar for Docling

Do not start with the UI. Build the extraction engine first.

---

## 19. Key Design Constraints

- TypeScript is the primary application language.
- Zod replaces Pydantic.
- Docling can be used through a sidecar, subprocess, or wrapper service.
- Qwen3-VL-32B-Instruct is the primary model.
- Use Alibaba Cloud API key from environment variables.
- Do not hardcode secrets.
- Do not assume consistent document templates.
- Do not rely on exact field names.
- Preserve evidence for every field.
- Treat low-confidence extraction as a normal expected outcome, not a fatal error.
- Support human review workflows.

---

## 20. Notes for Future Enhancements

Possible later additions:

- Store extraction results in PostgreSQL.
- Add a human review UI.
- Add document template clustering.
- Add field-level correction feedback.
- Add a golden dataset for evaluation.
- Add batch processing.
- Add queue workers with BullMQ.
- Add object storage support using S3-compatible storage.
- Add evaluation metrics: field-level precision, recall, exact match, and human correction rate.
- Add per-template extraction profiles.
- Add active learning from corrected extractions.

For the first build, focus on a working, testable TypeScript extraction engine with a CLI entry point.
