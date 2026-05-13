import { z } from "zod";

export const departmentTemplateRecordSchema = z.object({
  departmentTemplateId: z.string().min(1),
  templateName: z.string().min(1),
  templateVersion: z.string().min(1),
  effectiveFrom: z.string().optional(),
  sourceUrlOrApiRef: z.string().optional(),
  contentHash: z.string().optional()
});

export const departmentPolicyRecordSchema = z.object({
  departmentPolicyId: z.string().min(1),
  canonicalName: z.string().min(1),
  requirementForLocalPolicy: z.string().optional(),
  sourceOfRequirement: z.array(z.string()).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  visibility: z.enum(["public", "internal", "public_and_internal"]),
  riskLevel: z.enum(["critical", "high", "medium", "low"]),
  councilEndorsementRequired: z.boolean(),
  localPolicyTemplateLink: z.string().optional(),
  templateLastUpdatedAt: z.string().optional(),
  reviewCycle: z.string().optional(),
  approvalRequirements: z.string().optional(),
  consultationRequirements: z.string().optional(),
  requiredCommunicationMethods: z.array(z.string()).optional(),
  recommendedCommunicationMethods: z.array(z.string()).optional(),
  relatedPalPolicy: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  reviewCadenceMonths: z.number().int().positive().optional(),
  template: departmentTemplateRecordSchema.optional(),
  sourceUpdatedAt: z.string().optional()
});

export const crawlSchoolRequestSchema = z.object({
  schoolId: z.string().uuid(),
  crawlType: z.enum(["full_discovery", "incremental_refresh", "targeted_policy_check", "manual_recheck"]).default("incremental_refresh"),
  force: z.boolean().default(false)
});
