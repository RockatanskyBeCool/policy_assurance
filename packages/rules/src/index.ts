import type { ComplianceFindingType, DepartmentPolicyRecord, PolicyRiskLevel } from "@school-policy/shared";

export interface InventoryPolicyState {
  departmentPolicyId: string;
  publicUrl?: string;
  matchConfidence?: number;
  detectedReviewDate?: Date;
  templateVersionCurrent?: boolean;
}

export interface RuleFinding {
  departmentPolicyId: string;
  findingType: ComplianceFindingType;
  severity: PolicyRiskLevel;
  recommendedAction: string;
}

export interface PolicyInventoryCriteria {
  present: boolean;
  nextReviewDate?: Date | null;
  evaluationDate?: Date;
}

export interface PolicyInventoryEvaluation {
  present: boolean;
  reviewDateInFuture: boolean;
  compliant: boolean;
}

export function evaluatePolicyInventoryRow(criteria: PolicyInventoryCriteria): PolicyInventoryEvaluation {
  const evaluationDate = criteria.evaluationDate ?? new Date();
  const reviewDateInFuture =
    criteria.nextReviewDate instanceof Date &&
    !Number.isNaN(criteria.nextReviewDate.getTime()) &&
    criteria.nextReviewDate.getTime() > evaluationDate.getTime();

  return {
    present: criteria.present,
    reviewDateInFuture,
    compliant: criteria.present && reviewDateInFuture
  };
}

export function evaluatePublicPolicyRequirement(policy: DepartmentPolicyRecord, state?: InventoryPolicyState, now = new Date()): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const publicRequired = policy.visibility === "public" || policy.visibility === "public_and_internal";

  if (publicRequired && !state?.publicUrl) {
    findings.push({
      departmentPolicyId: policy.departmentPolicyId,
      findingType: "missing_public_policy",
      severity: policy.riskLevel,
      recommendedAction: `Publish the current ${policy.canonicalName} on the school website.`
    });
    return findings;
  }

  if (state?.matchConfidence !== undefined && state.matchConfidence < 0.75) {
    findings.push({
      departmentPolicyId: policy.departmentPolicyId,
      findingType: "low_confidence_match",
      severity: "medium",
      recommendedAction: `Review whether the discovered document is the correct ${policy.canonicalName}.`
    });
  }

  if (policy.reviewCadenceMonths && state?.detectedReviewDate) {
    const due = new Date(state.detectedReviewDate);
    due.setMonth(due.getMonth() + policy.reviewCadenceMonths);
    if (due < now) {
      findings.push({
        departmentPolicyId: policy.departmentPolicyId,
        findingType: "outdated_review_date",
        severity: policy.riskLevel === "critical" ? "critical" : "high",
        recommendedAction: `Review and update ${policy.canonicalName}; the detected review date is outside the required cadence.`
      });
    }
  }

  if (state?.templateVersionCurrent === false) {
    findings.push({
      departmentPolicyId: policy.departmentPolicyId,
      findingType: "template_version_outdated",
      severity: "medium",
      recommendedAction: `Update ${policy.canonicalName} using the current Department template.`
    });
  }

  return findings;
}
