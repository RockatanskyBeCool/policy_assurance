import { z } from "zod";

export const EvidenceSchema = z.object({
  value: z.string().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  sourceText: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable().optional()
});

export const PersonRoleSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  evidence: EvidenceSchema.optional()
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
  overallConfidence: z.number().min(0).max(1)
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type PersonRole = z.infer<typeof PersonRoleSchema>;
export type PolicyMetadata = z.infer<typeof PolicyMetadataSchema>;

export function emptyEvidence(confidence = 0): Evidence {
  return {
    value: null,
    pageNumber: null,
    sourceText: null,
    confidence
  };
}

export function emptyPolicyMetadata(): PolicyMetadata {
  return {
    title: emptyEvidence(),
    documentId: emptyEvidence(),
    version: emptyEvidence(),
    status: emptyEvidence(),
    approvalDate: emptyEvidence(),
    effectiveDate: emptyEvidence(),
    nextReviewDate: emptyEvidence(),
    reviewCycle: emptyEvidence(),
    policyOwner: emptyEvidence(),
    responsibleArea: emptyEvidence(),
    approvers: [],
    extractedWarnings: [],
    overallConfidence: 0
  };
}
