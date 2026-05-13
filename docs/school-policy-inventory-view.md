# School Policy Inventory View

This note defines the first school-specific policy inventory view and the backend API shape needed to replace the current UI mock data.

## User Flow

1. User lands on `/`.
2. User searches for a school.
3. After selecting a result, the UI navigates to `/schools/:schoolId`.
4. The school inventory view renders:
   - School details.
   - Required policy inventory table.
   - Summary charts.

The current frontend uses `/schools/tecoma-primary-school` as a mock route until school search and API integration are available.

## Backend Ownership Of Logic

Compliance logic should live in the backend/rules layer, not in the browser.

The browser should:

- Render school details.
- Render policy inventory rows.
- Render chart totals supplied by the API.
- Apply presentation-only formatting such as date display and badge styling.

The backend should:

- Determine which policies are required for the school.
- Determine whether a required policy is present.
- Extract and normalize policy metadata from PDFs.
- Evaluate review-date compliance using a consistent evaluation date.
- Return evidence and calculation metadata so results are auditable.

This keeps the UI thin and prevents compliance rules from drifting across browser sessions, timezones, or future clients.

## Pipeline Versus Rules Layer

Discovery/parsing pipeline responsibilities:

- Crawl the school website.
- Discover candidate PDF/DOCX/HTML policy documents.
- Populate `discovered_pdf`.
- Extract metadata into `pdf_extraction`, including:
  - `detected_approval_date`
  - `detected_approvers`
  - `detected_review_cycle`
  - `detected_next_review_date`
- Match documents to requirements in `policy_candidate_match`.
- Update `school_policy_inventory` with the accepted/current match for each required policy.
- Mark required policies missing when no accepted/current document exists.

Rules/evaluation responsibilities:

- Start from all applicable active rows in `policy_requirement`.
- Left join each requirement to `school_policy_inventory`.
- Determine `present` from accepted/current inventory state.
- Determine `reviewDateInFuture` by comparing extracted `detected_next_review_date` to the backend evaluation date.
- Determine MVP `compliant` as:

```ts
compliant = present && reviewDateInFuture
```

Future criteria should be added as explicit backend criteria, for example:

- `templateVersionCurrent`
- `mandatoryClausesPresent`
- `approvedByRequiredRole`
- `councilEndorsementComplete`
- `publicUrlAccessible`
- `documentDiscoverable`
- `accessibilityPass`

The API should expose the per-criterion booleans instead of only returning a final boolean. The UI can then show why a policy failed.

## Recommended API

### `GET /schools/:schoolId/policy-inventory`

Returns everything required to render the school inventory page.

Local development defaults:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Frontend API base URL override: `VITE_API_BASE_URL`

```ts
type SchoolPolicyInventoryResponse = {
  evaluationDate: string
  school: {
    id: string
    departmentSchoolId: string
    schoolName: string
    schoolType: string | null
    address: string | null
    region: string | null
    websiteUrl: string
    principalName: string | null
    councilPresidentName: string | null
    lastSuccessfulCrawlAt: string | null
  }
  summary: {
    requiredPolicyCount: number
    discoveredPolicyCount: number
    missingPolicyCount: number
    reviewCompliantCount: number
    reviewNonCompliantCount: number
    placeholderCount: number
  }
  policies: Array<{
    policyRequirementId: string
    policyName: string
    present: boolean
    approvalDate: string | null
    approvedBy: string[]
    reviewCycleYears: number | null
    nextReviewDate: string | null
    compliant: boolean
    criteria: {
      present: boolean
      reviewDateInFuture: boolean
      templateAligned?: boolean
      mandatoryClausesPresent?: boolean
    }
    evidence: {
      inventoryId: string | null
      discoveredPdfId: string | null
      matchId: string | null
      pdfUrl: string | null
      publicUrl: string | null
      extractionId: string | null
      extractionConfidence: number | null
      requiresHumanReview: boolean
    }
  }>
}
```

## Data Source Mapping

School details:

- `school.school_name`
- `school.address`
- `school.school_type`
- `school.region`
- `school.website_url`
- `school.last_successful_crawl_at`

Principal and council president are not currently obvious in `school`; they should either be added to school context/profile data or returned as `null` until the school profile model lands.

Policy table:

- Policy name: `policy_requirement.canonical_name`
- Present: accepted/current row in `school_policy_inventory`
- Approval date: `pdf_extraction.detected_approval_date`
- Approved by: `pdf_extraction.detected_approvers`
- Review cycle: normalized value from `pdf_extraction.detected_review_cycle`
- Next review: `pdf_extraction.detected_next_review_date`
- Compliant: backend rule result

Chart 1:

- Found: `summary.discoveredPolicyCount`
- Missing: `summary.missingPolicyCount`

Chart 2:

- Review compliant: `summary.reviewCompliantCount`
- Review non-compliant: `summary.reviewNonCompliantCount`

Chart 3:

- Placeholder for the next compliance dimension, likely template alignment.

## Query Shape

Conceptually:

```sql
select
  pr.id as policy_requirement_id,
  pr.canonical_name,
  spi.id as inventory_id,
  spi.current_discovered_pdf_id,
  spi.current_match_id,
  spi.inventory_status,
  spi.public_url,
  dp.pdf_url,
  pe.id as extraction_id,
  pe.detected_approval_date,
  pe.detected_approvers,
  pe.detected_review_cycle,
  pe.detected_next_review_date,
  pe.extraction_confidence,
  pe.requires_human_review
from policy_requirement pr
left join school_policy_inventory spi
  on spi.policy_requirement_id = pr.id
  and spi.school_id = :schoolId
left join discovered_pdf dp
  on dp.id = spi.current_discovered_pdf_id
left join pdf_extraction pe
  on pe.discovered_pdf_id = dp.id
where pr.status = 'active'
  and pr.visibility in ('public', 'public_and_internal')
order by pr.canonical_name;
```

Applicability rules should be applied before returning rows. If a policy is not required for the selected school, it should not appear in the table.

## Recommended Persistence Pattern

For MVP, the API can compute the view from current tables at request time.

As criteria expands, add a durable evaluation snapshot such as `policy_compliance_evaluation` or extend the findings model so each evaluation records:

- `school_id`
- `policy_requirement_id`
- `evaluation_date`
- `criteria_json`
- `compliant`
- `rule_version`
- `evidence_pack_id`
- `created_at`

That snapshot becomes important once reports need to explain historical compliance as of a date, not only current compliance.

## Current Implementation Gaps To Close

The current API route can be implemented before the crawler/runner is fully mature, but truly dynamic school-based rendering requires the runner to persist and materialize crawl results first.

### Can Be Built Now

The backend API can be implemented now if the relevant tables contain seeded or test data:

- Query `school` by `id`, `department_school_id`, or a stable slug.
- Query active/applicable `policy_requirement` rows.
- Left join current `school_policy_inventory`.
- Join through `discovered_pdf` to `pdf_extraction`.
- Compute `present`, `reviewDateInFuture`, `compliant`, and summary counts at request time.
- Return the response shape defined above.

This is enough to connect the UI dynamically for seeded schools.

### Runner Capability Needed For Real Crawl Results

The runner still needs a materialization step that takes crawler/parser/matcher output and writes the tables the API depends on.

At minimum, after a crawl completes the runner should:

1. Create/update a `crawl_run`.
2. Create/update discovered document records such as `discovered_pdf`.
3. Run PDF extraction and persist `pdf_extraction`.
4. Run matching and persist `policy_candidate_match`.
5. Select the accepted/current match per required policy.
6. Upsert `school_policy_inventory` for each accepted/current match.
7. Leave missing required policies discoverable by absence of inventory, or optionally upsert explicit missing inventory rows.
8. Optionally create/update `compliance_finding` rows for missing or stale policies.

Without this runner step, the API can return dynamic data only for rows that were manually seeded or separately inserted.

## MVP Sequencing Recommendation

Build this in three slices:

1. **Inventory API over existing tables**
   - Implement `GET /schools/:schoolId/policy-inventory`.
   - Compute MVP compliance at request time.
   - Use seeded data to connect the UI.

2. **Runner materialization**
   - Persist crawler results, extraction results, matches, and `school_policy_inventory`.
   - Re-run the same API against real crawl output.

3. **Rules snapshot**
   - Introduce persisted compliance evaluations once criteria expands beyond the MVP boolean.
   - Use rule versions and evidence packs for auditability.

## MVP Compliance Function

The backend should centralize this calculation in a small rules-layer helper so the API and future jobs do not duplicate the logic:

```ts
type PolicyInventoryCriteria = {
  present: boolean
  nextReviewDate: Date | null
  evaluationDate: Date
}

type PolicyInventoryEvaluation = {
  present: boolean
  reviewDateInFuture: boolean
  compliant: boolean
}

function evaluatePolicyInventoryRow(criteria: PolicyInventoryCriteria): PolicyInventoryEvaluation {
  const reviewDateInFuture =
    criteria.nextReviewDate !== null &&
    criteria.nextReviewDate.getTime() > criteria.evaluationDate.getTime()

  return {
    present: criteria.present,
    reviewDateInFuture,
    compliant: criteria.present && reviewDateInFuture,
  }
}
```

The UI should consume the result and should not reimplement this function.
