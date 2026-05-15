import { z } from "zod";

export const TemplateClauseSchema = z.object({
  clauseKey: z.string().min(1),
  heading: z.string().nullable().optional(),
  clauseText: z.string().min(1),
  clauseType: z.enum(["body", "heading", "table", "instructional", "sample", "placeholder"]).default("body"),
  isMandatory: z.boolean().default(false),
  isEditable: z.boolean().default(true),
  expectedPosition: z.number().int().positive().nullable().optional()
});

export const PolicyAlignmentEvidenceSchema = z.object({
  pageNumber: z.number().int().positive().nullable(),
  sourceText: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable().optional()
});

export const PolicyAlignmentFindingSchema = z.object({
  findingType: z.enum([
    "missing_required_section",
    "mandatory_clause_missing",
    "template_version_outdated",
    "school_customisation_needed",
    "instructional_text_present",
    "placeholder_unresolved",
    "substantive_wording_changed",
    "resource_reference_outdated",
    "positive_alignment"
  ]),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  clauseKey: z.string().nullable(),
  heading: z.string().nullable(),
  title: z.string().min(1),
  explanation: z.string().min(1),
  recommendedAction: z.string().min(1),
  evidence: PolicyAlignmentEvidenceSchema
});

export const PolicyAlignmentCriterionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["pass", "partial", "fail", "not_applicable", "unknown"]),
  score: z.number().min(0).max(1),
  summary: z.string().min(1)
});

export const PolicyAlignmentReportSchema = z.object({
  policyTitle: z.string().nullable(),
  templateName: z.string().nullable(),
  templateVersion: z.string().nullable(),
  overallScore: z.number().min(0).max(1),
  templateVersionCurrent: z.boolean().nullable(),
  executiveSummary: z.string().min(1),
  criteria: z.array(PolicyAlignmentCriterionSchema),
  findings: z.array(PolicyAlignmentFindingSchema),
  requiresHumanReview: z.boolean()
});

export type TemplateClause = z.infer<typeof TemplateClauseSchema>;
export type PolicyAlignmentEvidence = z.infer<typeof PolicyAlignmentEvidenceSchema>;
export type PolicyAlignmentFinding = z.infer<typeof PolicyAlignmentFindingSchema>;
export type PolicyAlignmentCriterion = z.infer<typeof PolicyAlignmentCriterionSchema>;
export type PolicyAlignmentReport = z.infer<typeof PolicyAlignmentReportSchema>;
