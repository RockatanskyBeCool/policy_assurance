# Policy Template Alignment Workflow

This note describes the LLM-assisted workflow for comparing a completed school policy PDF with the current Department template and producing user-facing gap analysis.

## Goal

Template alignment should explain whether a discovered policy is aligned with the current Department template, where it is outdated, and what the school should change. It should not behave like a raw text diff because Department templates intentionally include editable sections, sample wording, placeholders, and instructional text that should be removed from final policies.

## Pipeline Step

Add template alignment after PDF extraction and policy matching:

1. Crawl school site and discover candidate PDFs.
2. Extract policy metadata and page text from each candidate PDF.
3. Match the candidate to a `policy_requirement`.
4. Load the active `policy_template` and `policy_template_clause` rows for that requirement.
5. Run deterministic pre-checks:
   - required headings present
   - unresolved placeholders present
   - `Example School` or other template residue present
   - known current-version keywords present, where configured
6. Run LLM template alignment analysis with:
   - normalized template clauses
   - completed policy page text and tables
   - policy metadata and school name
   - deterministic pre-check results once available
7. Validate the LLM JSON response with `PolicyAlignmentReportSchema`.
8. Persist the report as evidence:
   - summary and raw report in `evidence_pack.evidence_json`
   - `templateSimilarityScore` or future alignment score on `policy_candidate_match`
   - durable per-run snapshot in a future `policy_compliance_evaluation`
   - open findings for high-confidence/high-severity gaps
9. Surface the report in the inventory UI as criteria, findings, evidence snippets, and recommended actions.

## LLM Contract

The LLM step is a constrained analysis layer. It must:

- return strict JSON only
- cite completed-policy page text for every finding where evidence exists
- distinguish acceptable school customisation from substantive gaps
- avoid requiring instructional or sample-only template text in final policies
- flag instructional text or placeholders that remain in the completed policy
- mark low-evidence conclusions as requiring human review

The first implementation lives in `@school-policy/pdf`:

- `buildPolicyAlignmentPrompt`
- `PolicyAlignmentService`
- `parsePolicyAlignmentReport`
- `PolicyAlignmentReportSchema`

## Finding Types

Supported report finding types:

- `missing_required_section`
- `mandatory_clause_missing`
- `template_version_outdated`
- `school_customisation_needed`
- `instructional_text_present`
- `placeholder_unresolved`
- `substantive_wording_changed`
- `resource_reference_outdated`
- `positive_alignment`

These map cleanly to existing compliance findings such as `mandatory_clause_missing` and `template_version_outdated`. Some report-only types can remain inside the evidence pack until the product needs first-class finding rows for them.

## Example User Value

For an older Anaphylaxis Policy, the report should be able to say:

- the document is recognisably the correct policy and follows the broad template structure
- current `Jext` and `Neffy` emergency-response instructions are missing
- current ISOC / EduSafe Plus incident reporting wording is missing
- the communication section is narrower than the current VRQA-style communication section
- a template note remains in the final PDF
- the school should update the document from the current Department template before treating it as aligned

## Guardrails

The LLM report is not the compliance source of truth by itself. It is an evidence-backed assessor that sits behind deterministic extraction, schema validation, confidence thresholds, and human review flags.

Production use should gate automatic findings on:

- valid schema parse
- evidence snippets with page references for present-text claims
- severity and confidence thresholds
- agreement with deterministic pre-checks for placeholders and template residue
- active template version and content hash
