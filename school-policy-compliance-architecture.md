# School Policy Compliance and Drafting Platform

## High-Level Architecture Document

### Document Purpose

This document describes a proposed system architecture, product workflow, AI/LLM operating model, and implementation roadmap for an application that assists with the development, review, publication, and compliance monitoring of school policy documents.

The application is targeted at Department of Education employees responsible for state-wide compliance reporting, while also supporting school principals, administrators, and school council presidents with practical remediation, endorsement, and drafting workflows.

The central design recommendation is:

> Make the core system rules-first, evidence-first, and workflow-first, then use the LLM as an accelerator inside that structure. The LLM should help classify, summarise, draft, compare, and prompt, but the application's trust should come from structured obligations, traceable evidence, and human approval.

Current implementation decision:

> Supabase Postgres is the selected relational data platform for the MVP and future cloud deployment. The application schema is managed through Supabase SQL migrations, while TypeScript services access the database through Drizzle ORM using `DATABASE_URL`.

---

## 1. Application Vision

The platform should be designed as a policy assurance and drafting system, not as a generic document chatbot.

It should:

- Scan school public websites to determine whether required public policy documents have been published.
- Identify missing, outdated, hard-to-find, duplicated, broken, or non-compliant policy documents.
- Parse internal school policies that are not publicly available.
- Check public and internal policies against Department requirements, template versions, review cadence, and governance requirements.
- Produce state-wide Department reporting on school policy compliance.
- Generate school-specific action plans for principals and administrators.
- Generate school council president reporting focused on review and endorsement obligations.
- Draft new or updated policy documents using Department templates and validated school context.
- Track review, approval, endorsement, publication, and audit history.

The desired outcome is fewer policy omissions, faster policy updates, better governance, more consistent policy quality, and reduced administrative burden for school leaders.

---

## 2. Problem Context

Schools are required to maintain a finite set of public and internal policies.

Some policies must be publicly available on the school website. Others remain internal to the school but still require compliance review, version control, current review dates, and governance oversight.

Department staff need state-wide reporting to understand:

- Which schools have published all required public policies.
- Which policies are missing.
- Which policies are outdated.
- Which policies are not aligned with the current Department template library.
- Which policies require school council endorsement.
- Which schools or regions require remediation support.

Principals and administrators need:

- A clear school-level action plan.
- Practical next steps rather than raw exception data.
- Assistance contextualising Department policy templates for their school.
- Draft policy documents that can be edited, reviewed, endorsed, and approved.

School council presidents need:

- A governance-focused view of policies requiring council review or endorsement.
- Meeting-ready policy packs.
- Clear status of overdue endorsement items.
- Evidence of governance decisions and endorsement history.

---

## 3. Core Compliance Challenges

The application needs to address a wider set of problems than simple document discovery.

Public policy challenges:

- Required public policies may be missing.
- Policies may be present but difficult to find.
- Documents may be incorrectly named.
- Multiple conflicting versions may be published.
- Links may be broken.
- Old versions may remain publicly accessible.
- Policies may be published outside expected navigation paths.
- PDF accessibility may be poor.
- Review dates may be missing, expired, or inconsistent.

Internal policy challenges:

- Internal policies may be stored inconsistently.
- Policy ownership and approval status may be unclear.
- Review dates and version history may not be structured.
- Policies may not align with current Department templates.
- School council endorsement status may be undocumented.

Drafting challenges:

- Department policy templates require school-specific contextualisation.
- Principals and administrators may not have time to adapt every template manually.
- Schools need drafts that preserve mandatory Department wording but populate local details.
- Drafting must not invent school-specific facts.
- Human approval remains essential.

---

## 4. Product Thesis

The platform should be a structured policy assurance system grounded in authoritative Department obligations.

It should not rely on an LLM as the primary compliance authority.

The operating model is:

- Rules determine what must be true.
- Evidence shows what was found.
- Workflow determines who must act, review, approve, endorse, publish, or close a finding.
- LLMs accelerate analysis and drafting within guardrails.
- Humans approve compliance outcomes and policy content.

---

## 5. Core Trust Model

```mermaid
flowchart LR
  A["Rules<br/>What must be true?"] --> D["Trusted compliance decision"]
  B["Evidence<br/>What did we find?"] --> D
  C["Workflow<br/>Who must act or approve?"] --> D

  E["LLM accelerator"] --> F["Classify"]
  E --> G["Summarise"]
  E --> H["Compare"]
  E --> I["Draft"]
  E --> J["Prompt"]

  F --> B
  G --> C
  H --> B
  I --> C
  J --> C

  D --> K["Reports, action plans, approved policy updates"]
```

The key principle is:

> The LLM accelerates the work, but it does not own the truth. Truth comes from rules, evidence, and human approval.

---

## 6. Major Functional Areas

The product has three major functional areas, applied to both public and internal policies in slightly different ways.

### 6.1 Public Policy Publication Compliance

Ensure all publicly required policies for all schools are published to the school's website and report at a state-wide level.

Capabilities:

- Index-first public document discovery using search APIs and targeted site queries.
- Targeted public website crawling as a fallback and verification aid.
- Required policy discovery.
- Link and document extraction.
- Publication status checking.
- Broken link detection.
- Duplicate/stale version detection.
- Website discoverability assessment.
- Public compliance reporting.

### 6.2 Public and Internal Policy Currency and Template Compliance

Ensure both public and internal policies are:

- Consistent with the current Department template library.
- Reviewed or renewed in line with Department review cadence.
- Version-controlled.
- Approved and endorsed where required.

Capabilities:

- Internal policy upload portal.
- Document parsing.
- Template matching.
- Review date extraction.
- Version and approval metadata tracking.
- School council endorsement tracking.
- Exception reporting to principals and council presidents.

### 6.3 Drafting and Remediation

Where non-compliance or omissions are discovered, draft an appropriate policy for the school in an editable, reviewable, and approval-ready form.

Capabilities:

- Current Department template retrieval.
- School context profile retrieval.
- Existing policy comparison.
- Missing local detail prompts.
- Controlled drafting with mandatory clauses preserved.
- Editable DOCX/PDF/web draft output.
- Review, approval, endorsement, and publication workflow.

---

## 7. High-Level System Architecture

```mermaid
flowchart LR
  PR["Department policy registry"] --> RE["Compliance rules engine"]
  SI["Search index APIs<br/>Google, Brave, Bing-style providers"] --> DO["Public discovery orchestrator"]
  TC["Targeted school website crawler"] --> DO
  DO --> FV["Document fetch and verification service"]
  IU["Internal policy upload portal"] --> PC["Document parser and classifier"]
  FV --> PC
  PC --> ES["Policy evidence store"]
  ES --> RE
  RE --> ST["Compliance scoring and triage"]
  ST --> DD["Statewide reporting dashboard"]
  ST --> AP["School action plans"]
  ST --> CP["Council president reports"]

  PR --> TL["Department template library"]
  ES --> SP["School context profile"]
  TL --> DW["Drafting workspace"]
  SP --> DW
  ST --> DW
  DW --> WF["Human review and approval workflow"]
  WF --> VR["Versioned policy repository"]
```

---

## 8. Rules-First, Evidence-First, Workflow-First Architecture

```mermaid
flowchart TD
  A["Department policy obligations<br/>Rules, review cadence, required clauses"] --> B["Rules-first core"]
  C["Public discovery evidence<br/>search queries, result ranks, URLs, crawl paths, documents"] --> D["Evidence-first layer"]
  E["Internal uploads<br/>Policies, metadata, endorsement records"] --> D

  D --> B
  B --> F["Compliance findings<br/>Missing, outdated, incomplete, unpublished"]

  F --> G["Workflow-first action system"]
  G --> H["Principal/admin action plan"]
  G --> I["School council endorsement workflow"]
  G --> J["Department statewide reporting"]

  K["LLM accelerator"] --> L["Classify documents"]
  K --> M["Summarise findings"]
  K --> N["Compare policy to template"]
  K --> O["Draft school-specific policy"]
  K --> P["Prompt for missing local details"]

  D --> K
  A --> K
  F --> K
  K --> G

  G --> Q["Human review and approval"]
  Q --> R["Approved policy update"]
  Q --> S["Publication or internal filing"]
  Q --> T["Audit trail"]

  R --> D
  S --> D
  T --> D
```

---

## 9. Core Architecture Components

### 9.1 Policy Obligation Register

The policy obligation register is the structured source of truth for compliance requirements.

It should store:

- Policy name.
- Policy aliases.
- Policy category.
- Public or internal requirement.
- Applicable school types.
- Applicability conditions.
- Review cadence.
- Due date rules.
- Escalation thresholds.
- Risk priority.
- Responsible roles.
- Evidence requirements.
- School council endorsement requirement.
- Current Department template version.
- Mandatory clauses.
- Optional clauses.
- Prohibited alterations.

This register should be managed as an admin system, not as an informal spreadsheet hidden in the background.

### 9.2 Department Template Library Integration

The platform should connect each policy requirement to the current approved Department template.

It should track:

- Template version.
- Release date.
- Effective date.
- Superseded versions.
- Mandatory protected text.
- Optional template sections.
- School-specific fields.
- Local procedure placeholders.
- Required approval or endorsement statements.

The template library is essential to controlled drafting and template alignment checks.

### 9.3 School Context Profile

The school context profile supports accurate compliance checks and context-aware policy drafting.

It should include:

- School name.
- School type.
- Region.
- Location.
- Year levels.
- Campuses.
- Enrolments.
- Governance details.
- Principal and administrator contacts.
- School council president details.
- Council meeting cycles.
- Publication preferences.
- Known policy owners.
- Operational factors such as camps, excursions, transport, specialist programs, disability inclusion, boarding, international students, high-risk activities, or other context relevant to policy drafting.

Every school-specific fact should have provenance.

Facts should be labelled as:

- Authoritative Department metadata.
- School-provided information.
- Extracted from existing policy.
- Extracted from public website.
- Inferred and requiring confirmation.

The system should never silently invent school-specific facts.

### 9.4 Public Discovery Orchestrator

The public discovery orchestrator finds required public policy documents using search indexes first, then targeted crawling and direct verification.

The preferred discovery order is:

1. Search index discovery using provider APIs such as Google Custom Search, Brave Search, Bing-style search APIs, or approved MCP search tools.
2. Direct verification of candidate URLs through controlled HTTP requests.
3. Sitemap, robots-aware, and known policy page discovery.
4. Targeted crawling of high-value pages, navigation paths, document repositories, and policy sections.
5. Manual review or school challenge workflow when automated discovery cannot prove the result.

Search discovery should generate bounded, auditable queries such as:

- `site:{school_domain} filetype:pdf policy`
- `site:{school_domain} filetype:pdf "{policy_alias}"`
- `site:{school_domain} "{required_policy_name}"`
- `site:{school_domain} inurl:policy`
- `site:{school_domain} "school policies"`

It should collect:

- URLs.
- Search provider.
- Search query.
- Search result rank.
- Search result title and snippet.
- Page titles.
- Link text.
- Navigation paths.
- Page context.
- PDF files.
- DOCX files.
- HTML policy pages.
- HTTP status codes.
- Redirects.
- Last-modified headers.
- File metadata.
- Discovery timestamps.
- Crawl timestamps where crawling was used.
- Screenshots where useful.

It should detect:

- Missing documents.
- Broken links.
- Duplicate versions.
- Stale copies.
- Hidden documents.
- Documents outside expected policy navigation.
- Conflicting policy files.
- Public/private placement issues.

The orchestrator should treat search results as candidate discovery evidence, not final compliance evidence.

If a search provider finds a candidate document, the platform should fetch and verify the document directly before it can support a compliance finding. If search providers do not find a document, that should not by itself prove absence, because indexes may be stale, incomplete, blocked by robots directives, missing newly published files, or unable to see documents behind site-specific navigation.

The targeted crawler remains important for:

- Verifying discoverability from expected school website navigation.
- Checking sitemaps, policy pages, and known document repositories.
- Finding documents not indexed by external search providers.
- Detecting broken links and stale public links.
- Proving where the platform looked when a required policy appears missing.

The public discovery process should be deterministic, auditable, polite to school websites, and cost-aware for paid search APIs.

### 9.5 Internal Policy Portal

The internal policy portal allows principals and administrators to upload and manage policies that are not public.

It should support:

- Authentication.
- Role-based access.
- Policy upload.
- Versioning.
- Metadata capture.
- Review date capture.
- Policy ownership.
- Approval state.
- Endorsement state.
- Superseded version tracking.
- Internal-only status.
- Export to DOCX or PDF.
- Controlled publication workflow where a document becomes public.

### 9.6 Document Ingestion and Parsing

The ingestion pipeline should extract and normalise policy content.

It should support:

- PDF text extraction.
- OCR fallback for scanned documents.
- DOCX structure parsing.
- HTML capture.
- Table extraction.
- Heading extraction.
- Metadata extraction.
- Date extraction.
- Version number extraction.
- Approval statement extraction.
- School council endorsement extraction.

Outputs should include:

- Original file.
- Extracted text.
- Structural representation.
- Document metadata.
- Extracted dates.
- Candidate policy category.
- Candidate template version.
- Evidence references.

### 9.7 Document Classifier and Matcher

The classifier maps discovered and uploaded documents to required policy categories.

Deterministic signals should be used first:

- File name.
- Document title.
- Headings.
- Known aliases.
- Link text.
- Page context.
- Template phrases.
- Metadata.
- Extracted review date.
- Existing Department template markers.

LLM assistance should be used for:

- Ambiguous names.
- Fuzzy matching.
- Differently named policies.
- Similarity analysis.
- Summarising evidence.

Each match should include:

- Matched policy requirement.
- Confidence level.
- Evidence summary.
- Source references.
- Classification explanation.
- Review status if confidence is low.

Ambiguous documents should not automatically satisfy compliance.

### 9.8 Evidence Store

The evidence store preserves the factual basis for compliance findings.

It should store:

- Source URL or uploaded file reference.
- Search provider, search query, result rank, and result snippet where search discovery was used.
- Discovery timestamp.
- Crawl timestamp.
- Upload timestamp.
- Extracted text.
- Extracted metadata.
- Review date evidence.
- Approval date evidence.
- Endorsement evidence.
- Template comparison evidence.
- Classification confidence.
- Rule version applied.
- Screenshots or crawl paths where useful.

This allows Department staff and schools to answer:

- What did we check?
- Where did we look?
- What did we find?
- What rule was applied?
- Why was this marked missing, stale, non-aligned, or compliant?
- Who reviewed or approved the final outcome?

### 9.9 Compliance Rules Engine

The rules engine is the heart of the platform.

It determines:

- Which policies apply to each school.
- Whether each policy must be public or internal.
- Whether a policy was found.
- Whether a public policy is discoverable.
- Whether the review date is current.
- Whether the policy aligns with the current template.
- Whether mandatory clauses are present.
- Whether prohibited wording changes occurred.
- Whether council endorsement is required.
- Whether endorsement has occurred.
- Whether the finding should be escalated.

This component should be mostly deterministic and explainable.

LLM outputs may inform or support findings but should not be the final authority for compliance.

### 9.10 Compliance Scoring and Triage

The system should prioritise findings based on risk and urgency.

Factors may include:

- Legal or statutory importance.
- Public publication requirement.
- Child safety or student welfare relevance.
- Missing versus outdated status.
- Degree of lateness.
- Template drift severity.
- Endorsement requirement.
- Duplicate or conflicting public versions.
- Repeated non-compliance history.
- Region or school-level risk indicators.

Example triage:

- Missing child safety policy: critical.
- Required public policy link broken: high.
- Review date overdue by 18 months: high.
- Template version one cycle behind: medium.
- Review due next term: low.

### 9.11 Reporting Layer

The reporting layer should support three main audiences.

Department view:

- State-wide compliance dashboard.
- Region-level compliance.
- School-level compliance.
- Policy-level heatmaps.
- High-risk omissions.
- Overdue review trends.
- Remediation status.
- Exportable action registers.
- Briefing packs.

Principal and administrator view:

- School-specific action plan.
- Missing policies.
- Outdated policies.
- Non-aligned policies.
- Publication issues.
- Internal policy issues.
- Required next actions.
- Draft document availability.
- Responsible role.
- Target date.
- Evidence links.

School council president view:

- Policies requiring council review.
- Policies requiring endorsement.
- Overdue endorsement items.
- Upcoming governance obligations.
- Meeting-ready policy packs.
- Approval decisions required.
- Endorsement history.

### 9.12 Drafting Workspace

The drafting workspace generates editable policy drafts using:

- Current Department templates.
- Existing school policy content.
- Validated school context.
- Compliance findings.
- Missing local detail prompts.

Drafts should be controlled, not freeform.

They should include:

- Locked or protected mandatory Department clauses.
- Editable school-specific fields.
- Optional local procedure blocks.
- Highlighted assumptions.
- Missing-information prompts.
- Redline-style comparison to existing policy where possible.
- Template version references.
- Source/provenance notes.
- Reviewer comments.
- Approval workflow.
- Endorsement workflow.
- Final DOCX/PDF/web export.

### 9.13 Workflow Engine

The workflow engine routes issues and drafts through accountable remediation.

It should support statuses such as:

- Finding identified.
- Evidence reviewed.
- School challenged or corrected.
- Draft generated.
- Local details requested.
- Principal review.
- Administrator edits.
- Council endorsement required.
- Council meeting scheduled.
- Endorsed.
- Approved.
- Published.
- Internal filing complete.
- Compliance closed.
- Superseded.

### 9.14 Versioned Policy Repository

The platform should maintain a versioned repository of:

- Original discovered files.
- Uploaded internal files.
- Generated drafts.
- Reviewed drafts.
- Approved policies.
- Endorsed policies.
- Published policies.
- Superseded versions.

Each version should retain:

- Template version.
- Review date.
- Approval date.
- Endorsement date.
- Publication URL.
- Responsible roles.
- Change history.
- Evidence references.

### 9.15 Audit Service

The audit service should maintain immutable audit events for:

- Search discoveries.
- Candidate URL fetches and verification attempts.
- Targeted crawls.
- Uploads.
- Classification decisions.
- Rule evaluations.
- LLM calls.
- Human reviews.
- Overrides.
- Draft generations.
- Edits.
- Approvals.
- Endorsements.
- Publications.
- Finding closures.

---

## 10. Logical System Architecture

```mermaid
flowchart TB
  subgraph Truth["Authoritative Sources of Truth"]
    PR["Policy obligation register"]
    TL["Department template library"]
    RC["Review cadence calendar"]
    SP["School context profiles"]
  end

  subgraph Capture["Evidence Capture"]
    SI["Search index discovery"]
    DO["Public discovery orchestrator"]
    CR["Targeted public crawler"]
    FV["Document fetch and verification"]
    IU["Internal upload portal"]
    DI["Document ingestion pipeline"]
    OCR["OCR and text extraction"]
  end

  subgraph Intelligence["Classification and Decision Core"]
    CL["Document classifier and matcher"]
    ES["Policy evidence store"]
    RE["Compliance rules engine"]
    SC["Risk scoring and triage"]
    LLM["LLM accelerator"]
  end

  subgraph Action["Workflow and Remediation"]
    AP["School action plans"]
    DW["Controlled drafting workspace"]
    WF["Approval and endorsement workflow"]
    PUB["Publication or internal filing"]
  end

  subgraph Reporting["Reporting and Analytics"]
    DD["Department dashboard"]
    SR["School reports"]
    CRP["Council president reports"]
    AN["Benchmarking and systemic insights"]
  end

  PR --> RE
  TL --> RE
  TL --> DW
  RC --> RE
  SP --> DW
  SP --> RE

  SI --> DO
  CR --> DO
  DO --> FV
  FV --> DI
  IU --> DI
  DI --> OCR
  OCR --> CL
  CL --> ES
  ES --> RE
  LLM --> CL
  LLM --> DW
  LLM --> AP
  RE --> SC

  SC --> DD
  SC --> SR
  SC --> CRP
  SC --> AP
  AP --> DW
  DW --> WF
  WF --> PUB
  PUB --> ES
  ES --> AN
```

---

## 11. Compliance Dimensions

The system should separate document existence from true policy compliance.

```mermaid
flowchart LR
  A["Policy required"] --> B["Exists?"]
  B --> C["Correct policy category?"]
  C --> D["Public/internal placement correct?"]
  D --> E["Discoverable?"]
  E --> F["Review date current?"]
  F --> G["Template version current?"]
  G --> H["Mandatory clauses present?"]
  H --> I["Council endorsement complete?"]
  I --> J["Compliant or action required"]
```

Compliance dimensions:

- Existence: the document was found or uploaded.
- Public availability: the public policy is available online where required.
- Discoverability: the public policy is reachable from expected navigation paths.
- Correct classification: the document corresponds to the required policy.
- Currency: review date aligns with Department cadence.
- Template alignment: the policy aligns with the current template version.
- Mandatory content: required clauses are present.
- Prohibited changes: protected wording has not been altered inappropriately.
- Approval status: principal or delegated approval is complete.
- Endorsement status: school council endorsement is complete where required.
- Accessibility: public documents are accessible and usable.
- Duplicate risk: no stale or conflicting versions are publicly available.

This allows the platform to report partial compliance rather than simplistic pass/fail results.

---

## 12. New School Public Policy Discovery Workflow

This section describes **initial discovery for a school that is not yet known to the platform**. Its job is to create the first trustworthy school record, learn the structure of the public website, discover candidate policy documents, and produce the first baseline `school_policy_inventory`.

This workflow is intentionally broader than a known-school update. It explores, learns, captures evidence, and records the site profile that future rescans should use.

Known-school update and rescan is a separate workflow. Once a school has a `school` row, `school_site_profile`, known useful pages, discovered PDFs, and inventory rows, future jobs should start from those learned assets and run as `incremental_refresh`, `targeted_policy_check`, or `manual_recheck` rather than repeating first discovery from scratch.

### 12.1 Discovery Goal

Initial discovery should answer five questions:

1. Is this the correct public website for the school?
2. What website platform and document publishing patterns does the school use?
3. Where are policy and document pages located?
4. Which public PDFs or document URLs plausibly correspond to required policy categories?
5. What baseline evidence supports the first inventory and any missing-policy findings?

The MVP implementation is centred on the school website crawler, CMS profiling, sitemap discovery, URL scoring, PDF candidate extraction, policy matching, PDF metadata extraction, and inventory upserts. External search results can be added as a fallback discovery aid, but they are not the primary implemented path.

### 12.2 New School Discovery Flow

```mermaid
flowchart LR
  A["New school name and website URL"] --> B["Verify and normalize homepage"]
  B --> C["Discover school details"]
  C --> D["Create school row"]
  D --> E["CMS and site profile preflight"]
  E --> F{"CMS playbook available?"}
  F -- "WordPress" --> G["Fetch WordPress sitemap candidates"]
  F -- "Unknown" --> H["Use generic policy-page seeds"]
  G --> I["Score sitemap pages and direct PDF URLs"]
  H --> J["Build broad first-discovery seeds"]
  I --> J
  J --> K["Crawl same-domain high-value pages"]
  K --> L["Capture page snapshots and links"]
  L --> M["Extract page and sitemap PDF candidates"]
  M --> N["Score, filter and dedupe documents"]
  N --> O["Match candidates to required policies"]
  O --> P["Verify and parse best candidates"]
  P --> Q["Create baseline inventory"]
  Q --> R["Create evidence packs and findings"]
  R --> S["Persist learned site profile for future rescans"]
```

### 12.3 Detailed Steps

1. Accept a new school name and authoritative website URL. For MVP CLI usage, a new school must provide `--url`; a name alone is not enough to create the record safely.
2. Normalize the homepage URL, follow redirects, and confirm the final URL remains on the expected school-owned domain.
3. Discover core school details from the homepage plus likely contact pages: school name, school number when available, address, email, phone, state, canonical domain, contact page URL, and inspected URLs.
4. Create the `school` row with discovered details and mark it active. Use a synthetic department ID only when an authoritative department school ID is not yet available.
5. Start a `crawl_run` with `crawl_type = full_discovery`. This first run should be treated as broad evidence gathering, not as a cheap freshness check.
6. Run CMS/site profile preflight from the homepage. The implemented detector recognises WordPress through generator metadata, `/wp-content/`, `/wp-includes/`, and sitemap links.
7. If WordPress is detected, fetch likely sitemap locations such as `/wp-sitemap.xml`, `/sitemap.xml`, and `/sitemap_index.xml`. Collect policy-relevant page URLs and direct PDF URLs.
8. Build initial crawl seeds from:
   - the homepage;
   - CMS sitemap page URLs scored for policy/document relevance;
   - common guessed policy paths such as `/policies`, `/school-policies`, `/documents`, `/downloads`, and `/resources`;
   - CMS-specific document locations, such as WordPress upload paths;
   - optional search-index results when sitemap and site navigation evidence is insufficient.
9. Crawl same-domain HTML pages within conservative limits. Prioritise URLs, link text, and surrounding text containing policy/document terms. Deprioritise low-value paths such as newsletters, calendars, booklists, canteen menus, uniform pages, flyers, and other non-policy documents.
10. Persist page evidence: normalized URL, title, content hash, HTML artifact, source/target links, link text, surrounding text, link type, and discovery score.
11. Extract candidate policy documents from crawled pages and direct sitemap PDF entries. Keep source page URL, filename, link text, surrounding text, and discovery score.
12. Score, dedupe, and cap candidate documents before expensive parsing. For the MVP, exclude known low-value categories such as OSHC material where they otherwise dominate policy-like results.
13. Match candidates against active public and public/internal policy requirements using canonical policy names and aliases. Keep all plausible candidate matches, but choose the highest-confidence candidate as the current baseline for each policy.
14. Verify and parse the best candidate for each matched policy when parsing is enabled. Persist extracted metadata such as detected title, approval date, next review date, approvers, review cycle, extraction confidence, warnings, and human-review flags.
15. Upsert `discovered_pdf`, `policy_candidate_match`, and `school_policy_inventory` rows. The inventory becomes the first current best-known state for the school.
16. Create evidence packs and findings for:
   - required public policies not found during baseline discovery;
   - matched policy links that cannot be fetched;
   - low-confidence matches that require review;
   - policies with extracted review dates that are already stale.
17. Persist a learned `school_site_profile` containing CMS type, sitemap URL, robots URL, known policy pages, known document pages, known PDF patterns, crawl strategy, crawl depth limit, and last profiled timestamp.
18. Update the school's `last_successful_crawl_at` once the baseline discovery completes successfully.

### 12.4 Evidence Produced By Initial Discovery

Initial discovery should leave enough evidence that a user can understand how a baseline inventory was produced.

It should persist:

- `school` details and canonical domain.
- `school_site_profile` with learned discovery paths.
- `crawl_run` summary and seed URLs.
- `crawl_url_cache` records for checked HTML and PDF URLs.
- `page_snapshot` artifacts for visited HTML pages.
- `page_link` records with link context and discovery score.
- `discovered_pdf` rows for candidate documents.
- `pdf_extraction` rows for parsed policy documents.
- `policy_candidate_match` rows explaining why a candidate was linked to a requirement.
- `school_policy_inventory` rows for the current baseline.
- `evidence_pack` and `compliance_finding` rows for missing, broken, stale, or low-confidence cases.

### 12.5 Handoff To Known-School Updates

Initial discovery should finish by producing the inputs needed for a cheaper known-school update workflow:

- High-value policy and document pages.
- Previously matched policy PDF URLs.
- Known PDF URL patterns.
- Sitemap URLs that worked and sitemap URLs that failed.
- URL cache metadata, including content hashes, ETag, Last-Modified, and last checked timestamps when available.
- Current inventory rows with `first_found_at`, `last_confirmed_at`, `last_changed_at`, confidence, public URL, and current match/PDF IDs.

A known-school update should then behave differently:

- Start from the existing `school_site_profile`, current inventory URLs, known policy pages, and known PDF patterns.
- Use conditional requests and content hashes to detect changed or removed documents.
- Re-parse only new or changed documents where possible.
- Preserve the historical `first_found_at` while updating confirmation and change timestamps.
- Escalate to a broader `full_discovery` only when known URLs fail, profile evidence becomes stale, or too many required policies cannot be re-confirmed.

### 12.6 Current MVP Gap

The schema already supports distinct crawl modes through `crawl_type`, and the worker reduces crawl breadth for non-`full_discovery` jobs. The current CLI, however, still records every run as `full_discovery`, does not pass a database-backed cache lookup into `SchoolSiteCrawler`, and does not yet seed directly from previously matched policy PDF URLs.

That means the MVP already learns enough site profile and inventory data to support a proper known-school rescan, but the dedicated rescan path still needs to be implemented as a separate workflow.

Search index results can support discovery and prioritisation in future versions, especially for schools with poor navigation or incomplete sitemaps. Absence from an external search index should never be treated as conclusive evidence that a required policy is missing.

---

## 13. CMS Detection and CMS Playbooks

Because schools do not expose policy documents in a standard way, the scraper should not treat every website as the same generic crawl problem.

The first step of public discovery should be a **CMS/site profile preflight**. The goal is to determine the likely website platform, identify high-value discovery paths, and choose a CMS-specific playbook before crawling broadly.

This matters because many school websites are built on a small number of common platforms. Each platform tends to expose pages, media files, document repositories, sitemaps, and public assets in predictable ways.

### 13.1 CMS Preflight

Before starting a full crawl, the scraper should fetch the school homepage and inspect:

- HTML generator metadata.
- Script and stylesheet paths.
- Asset URL patterns.
- Sitemap links.
- Robots.txt references.
- Common CMS-specific paths.
- Link and navigation structure.
- Known public document or media directories.

The CMS profile should include:

- Detected CMS type.
- Confidence score.
- Detection signals.
- Candidate sitemap URLs.
- Candidate document repository paths.
- Candidate policy page paths.
- Crawl strategy recommendation.

Example CMS profile:

```json
{
  "cmsType": "wordpress",
  "confidence": 0.7,
  "signals": [
    "wp-includes-asset",
    "wp-content-asset"
  ],
  "sitemapUrls": [
    "https://school.example/wp-sitemap.xml",
    "https://school.example/sitemap.xml"
  ]
}
```

### 13.2 CMS Playbook Concept

A CMS playbook is a controlled discovery strategy for a known platform.

Each playbook should define:

- Detection signals.
- Sitemap locations.
- Common document and media paths.
- Common policy/document page paths.
- URL scoring rules.
- Candidate PDF discovery rules.
- Safe crawl limits.
- Paths to avoid.
- Cache keys and invalidation strategy.

The crawler should use the playbook to seed high-value URLs before exploring lower-confidence paths.

This avoids two bad outcomes:

- Crawling too little and missing policy PDFs.
- Crawling too broadly and creating unnecessary operational or cybersecurity concerns.

### 13.3 WordPress Playbook

For WordPress sites, the scraper should look for:

- `/wp-content/` asset paths.
- `/wp-includes/` asset paths.
- WordPress generator metadata.
- `/wp-sitemap.xml`.
- `/sitemap.xml`.
- `/sitemap_index.xml`.
- WordPress page/post sitemaps such as `/page-sitemap.xml` and `/post-sitemap.xml`.
- Uploaded media under `/wp-content/uploads/YYYY/MM/...`.

The WordPress playbook should seed:

- Homepage.
- WordPress sitemap URLs.
- Sitemap-discovered pages with policy, document, parent, about, resource, form, newsletter, school council, or information terms.
- Common guessed policy paths such as `/policies`, `/school-policies`, `/about-us/policies`, `/documents`, `/downloads`, and `/resources`.
- Previously successful policy pages from the school site profile.
- Previously found PDF URLs from the school policy inventory.

The WordPress playbook should score candidate PDFs using:

- PDF filename.
- Link text.
- Surrounding text.
- Source page URL.
- Source page title.
- Department policy aliases.
- Known policy terms.

High-value examples:

- `Child-Safety-and-Wellbeing-Policy.pdf`.
- `Student-Wellbeing-and-Engagement-Policy.pdf`.
- `Complaints-Policy.pdf`.
- `Anaphylaxis-Policy.pdf`.
- `Yard-Duty-and-Supervision-Policy.pdf`.
- `Digital-Learning-Internet-Social-Media-and-Digital-Devices.pdf`.

Low-value examples:

- Newsletters.
- Canteen menus.
- Booklists.
- Uniform lists.
- Event flyers.
- Calendars.

### 13.4 WordPress Discovery Flow

```mermaid
flowchart TD
  A["Fetch school homepage"] --> B["Detect CMS signals"]
  B --> C{"WordPress?"}
  C -- "Yes" --> D["Seed WordPress sitemap URLs"]
  C -- "No" --> E["Use generic discovery playbook"]
  D --> F["Fetch sitemap indexes and page sitemaps"]
  F --> G["Score sitemap URLs for policy/document relevance"]
  G --> H["Seed high-value pages"]
  H --> I["Extract links and candidate PDFs"]
  I --> J["Score PDFs using filename, link text, context and aliases"]
  J --> K["Match candidates to policy requirements"]
  K --> L["Update school site profile and policy inventory"]
```

### 13.5 Lessons From Tecoma Primary School Test

A guarded live test against `https://tecomaps.vic.edu.au/` demonstrated why CMS playbooks matter.

Initial generic crawl:

- Visited 1 page.
- Found 1 non-policy PDF.
- Matched no required policies.

WordPress playbook crawl:

- Detected WordPress from `wp-includes` and `wp-content` signals.
- Fetched WordPress sitemaps.
- Visited 31 pages.
- Found 50 candidate PDFs.
- Matched most of the temporary policy list.

Matched policies included:

- Child Safety Policy.
- Student Wellbeing and Engagement Policy.
- Complaints Policy.
- Privacy Policy.
- Anaphylaxis Policy.
- Attendance Policy.
- Yard Duty and Supervision Policy.
- Bullying Prevention Policy.
- Digital Learning Policy.

The only unmatched temporary policy was:

- Child Safe Standards Policy.

This result suggests CMS-aware discovery should be part of the MVP, not a later optimisation.

### 13.6 Site Profile Learning

The scraper should cache what it learns about each school website.

For a WordPress school site, the profile should store:

- CMS type and confidence.
- Detection signals.
- Working sitemap URLs.
- Failed sitemap URLs.
- High-value policy/document pages.
- Known PDF URL patterns.
- Previously matched policy URLs.
- Pages that produced useful policy PDFs.
- Pages that repeatedly produced low-value PDFs.
- Last successful crawl strategy.

For example, after crawling a WordPress school site, the profile might learn:

```json
{
  "cmsType": "wordpress",
  "knownPolicyPages": [
    "https://school.example/newsletters-forms/",
    "https://school.example/out-of-school-hours-care/"
  ],
  "knownPdfPatterns": [
    "https://school.example/wp-content/uploads/"
  ],
  "workingSitemaps": [
    "https://school.example/wp-sitemap.xml",
    "https://school.example/page-sitemap.xml"
  ],
  "failedSitemaps": [
    "https://school.example/sitemap_index.xml"
  ]
}
```

Future crawls should start from these known useful locations instead of performing broad discovery every time.

### 13.7 CMS Playbook Registry

Over time, the system should maintain a registry of CMS playbooks.

Initial playbooks:

- WordPress.
- Generic static site.

Likely future playbooks:

- School-specific hosted CMS platforms.
- SharePoint or Microsoft-hosted document repositories.
- Google Drive or embedded public folders.
- Wix.
- Squarespace.
- Finalsite or other education-sector CMS platforms.

Each playbook should be versioned because discovery strategies will evolve.

CMS playbook version should be stored with crawl evidence so the system can explain why a particular discovery strategy was used.

### 13.8 Safety Controls For CMS Playbooks

CMS playbooks must remain bounded.

Required controls:

- Explicit live-crawl flag for test scripts.
- Single-domain allowlist.
- Respect robots.txt where applicable.
- Clear user-agent.
- Request delay.
- Maximum sitemap fetch count.
- Maximum page count.
- Maximum PDF candidate count.
- Maximum crawl depth.
- Avoid search pages, calendars, login pages, admin paths, and dynamic query traps.
- Prefer incremental refresh after initial discovery.

The goal is to discover policy evidence efficiently without behaving like an aggressive crawler.

---

## 14. Internal Policy Workflow

```mermaid
flowchart LR
  A["Principal or administrator uploads policy"] --> B["Metadata capture"]
  B --> C["Parse document"]
  C --> D["Extract dates, version and endorsement info"]
  D --> E["Match to policy requirement"]
  E --> F["Run internal compliance checks"]
  F --> G["Generate action item if needed"]
  G --> H["Draft, review, approve or endorse"]
  H --> I["Store version and audit record"]
```

The internal policy portal should:

- Support upload of internal-only policies.
- Prompt for missing metadata.
- Track policy owner.
- Track review date.
- Track approval status.
- Track endorsement status.
- Compare against Department templates.
- Generate exceptions where policies are missing, outdated, non-aligned, or lacking endorsement.
- Route remediation through review and approval workflows.

---

## 15. End-to-End Remediation Pipeline

```mermaid
flowchart LR
  A["Ingest Department obligations"] --> B["Discover public documents and ingest uploads"]
  B --> C["Parse and classify documents"]
  C --> D["Match to policy requirements"]
  D --> E["Run compliance rules"]
  E --> F["Score and prioritise findings"]
  F --> G["Generate action plans"]
  G --> H["Draft or update policy"]
  H --> I["Principal/admin review"]
  I --> J["Council endorsement if required"]
  J --> K["Publication or internal filing"]
  K --> L["Close finding with evidence and audit history"]
```

Detailed remediation flow:

1. Ingest Department obligations, template metadata, review calendars, and school profile data.
2. Discover public policy documents through search indexes, direct verification, targeted crawling, and internal policy uploads.
3. Parse, classify, and match documents to Department policy requirements.
4. Run compliance rules and generate evidence-backed findings.
5. Score and prioritise findings into school action plans and Department dashboards.
6. Draft missing or updated policies using templates and school context.
7. Route drafts through principal review, administrator edits, council endorsement, Department oversight where required, and publication or internal filing.
8. Close findings only when evidence, approvals, and audit records support remediation.

---

## 16. Reporting and Action Plans

### 16.1 Department State-Wide Reporting

The Department dashboard should provide:

- Compliance by school.
- Compliance by region.
- Compliance by school type.
- Compliance by policy category.
- Public publication status.
- Internal policy currency.
- Template alignment.
- Review status.
- Endorsement status.
- High-risk omissions.
- Overdue policy reviews.
- Heatmaps.
- Trends over time.
- Exportable action registers.
- Briefing packs.
- Systemic insights.

Potential insights:

- Which policies are most often missing.
- Which regions require support.
- Which templates create the most drafting friction.
- Which school website platforms generate publication issues.
- Which policies are most often overdue.
- Which schools repeatedly miss review deadlines.

### 16.2 School-Level Action Plans

Each school should receive a tailored action plan showing:

- Missing policies.
- Outdated policies.
- Policies not aligned with current templates.
- Public policies not published.
- Public policies not discoverable.
- Broken links.
- Duplicate outdated copies.
- Policies requiring council endorsement.
- Policies due soon.
- Required next best action.
- Responsible role.
- Target date.
- Evidence links.
- Relevant template.
- Draft availability.
- Remediation status.

Example next best actions:

- Publish existing current policy to website.
- Update policy using current Department template.
- Confirm local contact details before draft can be completed.
- Schedule school council endorsement.
- Remove duplicate outdated version from website.
- Upload internal policy for review.
- Confirm whether policy is applicable.

### 16.3 School Council President Reporting

Council president reporting should be governance-focused and concise.

It should show:

- Policies requiring council review.
- Policies requiring council endorsement.
- Overdue endorsement items.
- Upcoming review obligations.
- Policies ready for meeting agenda inclusion.
- Meeting-ready policy packs.
- Draft documents.
- Decisions required.
- Endorsement history.
- Post-meeting confirmation status.

---

## 17. Evidence Packs

Every compliance finding should include an evidence pack.

Evidence packs should include:

- Source URL or uploaded file.
- Date scanned or uploaded.
- Search provider, query, result rank, title, and snippet where search discovery was used.
- Crawl path.
- Link text.
- Page context.
- HTTP status.
- File metadata.
- Extracted text.
- Extracted review date.
- Extracted approval date.
- Extracted endorsement date.
- Matched policy requirement.
- Applied rule.
- Template comparison evidence.
- Classification confidence.
- Screenshots where useful.
- Reviewer notes.
- Challenge/correction history.

This is crucial for trust, dispute resolution, and audit readiness.

---

## 18. Controlled Drafting Model

The drafting system should not simply ask an LLM to "write a school policy."

It should generate controlled drafts from:

- Current Department templates.
- Mandatory clauses.
- Editable fields.
- Existing school policies.
- Validated school context.
- Compliance findings.
- Missing local detail prompts.

Draft structure:

- Mandatory Department text: protected.
- School-specific fields: editable.
- Optional local procedure sections: editable.
- Assumptions: highlighted.
- Missing information: explicitly prompted.
- Source facts: cited or traceable.
- Existing policy changes: shown as redline-style guidance where possible.

Draft status labels:

- Generated.
- Requires local details.
- Principal review.
- Administrator edits.
- Council endorsement required.
- Endorsed.
- Approved.
- Published.
- Filed internally.
- Superseded.

---

## 19. Human Approval and Governance Workflow

```mermaid
flowchart TD
  A["Compliance finding"] --> B["Action plan item"]
  B --> C{"Draft required?"}
  C -- "No" --> D["Operational remediation<br/>publish, upload, correct metadata, remove duplicate"]
  C -- "Yes" --> E["Generate controlled draft"]
  E --> F["Principal/admin review"]
  F --> G{"Missing local details?"}
  G -- "Yes" --> H["Prompt school for details"]
  H --> F
  G -- "No" --> I{"Council endorsement required?"}
  I -- "Yes" --> J["Council meeting pack"]
  J --> K["Council endorsement recorded"]
  I -- "No" --> L["Principal approval"]
  K --> L
  D --> M["Evidence updated"]
  L --> M
  M --> N["Publish or file internally"]
  N --> O["Close finding with audit trail"]
```

Human approval is required before:

- A draft policy is finalised.
- A policy is marked approved.
- A policy is marked endorsed.
- A policy is published.
- A compliance finding is closed.
- A formal escalation is sent.

---

## 20. LLM Role

LLMs are valuable for accelerating work where language understanding and drafting are useful.

Appropriate LLM roles:

- Classify ambiguous documents.
- Match differently named policies to required policy categories.
- Summarise findings.
- Explain why a policy appears out of date.
- Compare existing policy wording against Department templates.
- Identify missing mandatory clauses.
- Identify outdated references.
- Draft school-specific policy text from approved templates.
- Populate template placeholders using validated school context.
- Prompt principals and administrators for missing local information.
- Generate plain-English action plans.
- Generate school council meeting summaries.
- Convert findings into operational task lists.

### LLM Guardrails

LLMs should not:

- Make final compliance determinations.
- Provide legal interpretation as final authority.
- Calculate review deadlines without rules-engine verification.
- Decide whether a statutory obligation has been met.
- Invent school-specific facts.
- Rewrite mandatory Department clauses freely.
- Approve policies.
- Publish documents.
- Mark findings as remediated.
- Send formal escalations without review.

Recommended pattern:

> LLM proposes. Rules verify. Humans approve. Evidence is preserved.

---

## 21. AI Agent Opportunities

Bounded AI agents may be useful for expediting multi-step remediation work.

Potential agent tasks:

- Generate bounded `site:` and `filetype:` search queries using alternate policy names and Department template phrases.
- Retry discovery through approved search APIs, MCP tools, sitemaps, and targeted crawling when initial results are incomplete.
- Prepare draft exception explanations.
- Prepare school action plans.
- Compare an existing policy to the current Department template.
- Identify required edits.
- Prepare first-draft policy updates.
- Ask principals for missing local details.
- Route tasks into workflow.
- Track whether remediation has been completed.

Agent constraints:

- Agents should have constrained tools.
- Agents should read approved templates, school profiles, evidence packs, and existing policies.
- Agents may draft into a controlled workspace.
- Agents may create tasks.
- Agents may prepare communications for review.
- Agents must not directly publish to a school website.
- Agents must not mark compliance resolved.
- Agents must not send formal escalation emails without human approval.
- Agents must not approve legal or governance outcomes.

---

## 22. Data Model

Important entities:

- School.
- PolicyRequirement.
- PolicyTemplate.
- ReviewCadence.
- SchoolContextFact.
- SearchDiscoveryQuery.
- SearchDiscoveryResult.
- CandidateUrlFetch.
- DiscoveredDocument.
- UploadedDocument.
- ExtractedDocumentContent.
- PolicyMatch.
- ComplianceFinding.
- EvidencePack.
- ActionPlan.
- ActionItem.
- DraftPolicy.
- ApprovalWorkflow.
- CouncilEndorsement.
- PublicationEvidence.
- AuditEvent.
- User.
- Role.

```mermaid
erDiagram
  SCHOOL ||--o{ SCHOOL_CONTEXT_FACT : has
  SCHOOL ||--o{ SEARCH_DISCOVERY_QUERY : runs
  SCHOOL ||--o{ CANDIDATE_URL_FETCH : verifies
  SCHOOL ||--o{ DISCOVERED_DOCUMENT : has
  SCHOOL ||--o{ UPLOADED_DOCUMENT : has
  SCHOOL ||--o{ COMPLIANCE_FINDING : receives
  SCHOOL ||--o{ ACTION_PLAN : has

  POLICY_REQUIREMENT ||--o{ POLICY_TEMPLATE : uses
  POLICY_REQUIREMENT ||--o{ POLICY_MATCH : matched_by
  POLICY_REQUIREMENT ||--o{ COMPLIANCE_FINDING : drives
  POLICY_REQUIREMENT ||--|| REVIEW_CADENCE : follows

  SEARCH_DISCOVERY_QUERY ||--o{ SEARCH_DISCOVERY_RESULT : returns
  SEARCH_DISCOVERY_RESULT ||--o{ CANDIDATE_URL_FETCH : verifies
  CANDIDATE_URL_FETCH ||--o{ DISCOVERED_DOCUMENT : may_create
  DISCOVERED_DOCUMENT ||--o{ POLICY_MATCH : produces
  UPLOADED_DOCUMENT ||--o{ POLICY_MATCH : produces
  POLICY_MATCH ||--o{ EVIDENCE_PACK : supported_by
  COMPLIANCE_FINDING ||--|| EVIDENCE_PACK : includes
  COMPLIANCE_FINDING ||--o{ ACTION_ITEM : creates
  ACTION_PLAN ||--o{ ACTION_ITEM : contains

  ACTION_ITEM ||--o{ DRAFT_POLICY : may_generate
  DRAFT_POLICY ||--o{ APPROVAL_WORKFLOW : enters
  APPROVAL_WORKFLOW ||--o{ COUNCIL_ENDORSEMENT : may_require
  APPROVAL_WORKFLOW ||--o{ PUBLICATION_EVIDENCE : may_publish

  AUDIT_EVENT }o--|| SCHOOL : records
  AUDIT_EVENT }o--|| COMPLIANCE_FINDING : records
  AUDIT_EVENT }o--|| DRAFT_POLICY : records
```

### Entity Notes

School:

- Stores authoritative school metadata and identifiers.

PolicyRequirement:

- Stores the obligation definition for a policy.

PolicyTemplate:

- Stores template version metadata and protected template content references.

ReviewCadence:

- Stores required review frequency and due date calculation rules.

SchoolContextFact:

- Stores school-specific facts with provenance and confidence.

SearchDiscoveryQuery:

- Stores provider, query text, school domain, policy aliases used, execution timestamp, result count, cost metadata, and tool or MCP invocation metadata.

SearchDiscoveryResult:

- Stores returned URL, title, snippet, result rank, provider metadata, and whether the result was selected for direct verification.

CandidateUrlFetch:

- Stores direct verification results for a candidate URL, including HTTP status, redirects, content type, content hash, final URL, last-modified headers, and fetch timestamp.

DiscoveredDocument:

- Stores verified public website document discovery records after a candidate URL or crawled document has been fetched.

UploadedDocument:

- Stores internal or school-provided policy uploads.

PolicyMatch:

- Stores classification result, confidence, evidence, and reviewer status.

ComplianceFinding:

- Stores missing, outdated, unpublished, non-aligned, endorsement-pending, or other findings.

EvidencePack:

- Stores evidence references and rule application history.

ActionPlan and ActionItem:

- Stores remediation plan and task-level actions.

DraftPolicy:

- Stores generated and edited policy drafts.

ApprovalWorkflow:

- Tracks principal, administrator, Department, and council workflow steps.

CouncilEndorsement:

- Tracks governance review and endorsement.

PublicationEvidence:

- Stores publication URL, timestamp, and verification evidence.

AuditEvent:

- Stores immutable history of important actions.

---

## 23. Security, Privacy, and Governance

The platform will handle sensitive internal policy documents and school-specific context.

Security requirements:

- Strong authentication.
- Role-based access control.
- Least privilege access.
- Separation between Department, school, and council views.
- Encryption at rest.
- Encryption in transit.
- Secure object storage.
- Immutable audit logs.
- Data retention policies.
- Secure document deletion and supersession.
- Provider governance for LLM use.
- Provider governance for external search API use, including query logging, retention, cost controls, and approved data-use terms.

Privacy and AI governance:

- Do not send sensitive internal documents to unapproved model providers.
- Log model use, prompts, context, outputs, and reviewer decisions.
- Avoid using LLM outputs without source references.
- Review hallucination risk.
- Require human review for legal, governance, and public-facing outputs.
- Maintain clear distinction between generated draft text and approved policy text.

Access model:

- Department policy owner: maintain obligations, templates, cadence, rules.
- Department compliance user: view dashboards, findings, trends, exports.
- Principal: view school findings, review drafts, approve policies.
- School administrator: upload documents, edit drafts, manage metadata.
- School council president: view endorsement obligations and meeting packs.
- System administrator: manage platform operations and permissions.

---

## 24. MVP Roadmap

### Phase 1: Public Compliance Visibility

Build:

- Policy obligation register.
- Template metadata.
- Public discovery orchestrator.
- Search index API integration.
- Targeted public website crawler.
- Document fetch and verification.
- Document parser.
- Classifier.
- Rules engine.
- Department dashboard.

Goal:

- Give the Department immediate state-wide visibility of public policy publication compliance.

### Phase 2: School Action Plans and Evidence Packs

Build:

- School-level exception reports.
- Evidence packs.
- Challenge and correction workflows.
- Publication remediation tracking.
- Exportable action registers.

Goal:

- Convert findings into practical remediation.

### Phase 3: Internal Policy Portal

Build:

- Authenticated upload portal.
- Internal policy version control.
- Metadata capture.
- Review date tracking.
- Internal compliance checks.
- Approval and endorsement status capture.

Goal:

- Extend compliance beyond public policies to internal governance.

### Phase 4: Controlled Drafting Workspace

Build:

- Department template integration.
- School context profiles.
- Existing policy comparison.
- Controlled LLM-assisted drafting.
- Missing detail prompts.
- Editable drafts.
- DOCX/PDF export.

Goal:

- Reduce administrative burden for principals and administrators.

### Phase 5: School Council Workflow

Build:

- Council endorsement tracking.
- Meeting-ready policy packs.
- Reminders.
- Endorsement recording.
- Governance reporting.

Goal:

- Support council presidents and improve governance compliance.

### Phase 6: Advanced Analytics and Bounded Agents

Build:

- Benchmarking.
- Systemic insights.
- Template friction analysis.
- Regional trends.
- Bounded AI remediation agents.

Goal:

- Move from compliance monitoring to continuous policy system intelligence.

---

## 25. Target Operating Model

Department policy owners:

- Maintain the policy obligation register.
- Maintain the Department template library.
- Maintain review cadence rules.
- Maintain compliance rules.
- Approve template changes.

Department compliance teams:

- Monitor state-wide dashboards.
- Review high-risk exceptions.
- Track remediation.
- Export reports and briefing packs.
- Identify systemic risks.

Principals and administrators:

- Upload internal policies.
- Review school action plans.
- Provide missing local details.
- Edit and approve draft policies.
- Publish public policies where required.
- Manage internal filing.

School council presidents:

- Review governance-focused reports.
- Receive meeting-ready policy packs.
- Confirm endorsement decisions.
- Track overdue council obligations.

Platform:

- Continuously rescans.
- Re-evaluates findings.
- Updates compliance status.
- Maintains audit history.
- Supports remediation closure only when evidence and approvals are complete.

---

## 26. Success Measures

Compliance outcomes:

- Percentage of schools with all required public policies discoverable online.
- Percentage of required public policies published correctly.
- Percentage of required internal policies uploaded and current.
- Percentage of policies aligned with current Department templates.
- Reduction in missing policies.
- Reduction in overdue policy reviews.
- Reduction in missing review dates.
- Reduction in duplicate, stale, or conflicting policy versions.
- Reduction in broken links.

Operational outcomes:

- Time saved by principals and administrators during policy drafting and updating.
- Time from finding detection to remediation closure.
- Number of draft policies generated.
- Number of drafts approved.
- Number of policies published after remediation.
- Number of council endorsement items completed on time.

Governance outcomes:

- Improved audit readiness.
- Improved visibility of endorsement obligations.
- More complete policy version histories.
- Better state-wide policy compliance reporting.
- Stronger evidence trail for Department oversight.

System intelligence outcomes:

- Identification of frequently missing policies.
- Identification of templates causing repeated drafting friction.
- Identification of regions requiring additional support.
- Identification of website platforms causing publication issues.

---

## 27. Architecture Deck Narrative

This section preserves the detailed deck narrative created for the presentation.

### Slide 1: A Policy Assurance Platform, Not a Document Chatbot

Claim:

The application gives the Department state-wide policy visibility while helping schools remediate gaps faster.

Key points:

- Combines public website scanning, internal policy governance, and context-aware drafting.
- Serves Department compliance teams, principals, administrators, and school council presidents.
- Anchors trust in structured obligations, traceable evidence, workflow controls, and human approval.
- Uses LLMs to accelerate classification, comparison, summarisation, prompting, and drafting.

### Slide 2: The Compliance Problem Is Bigger Than Whether a PDF Exists

Claim:

Schools can appear compliant while still carrying hidden publication, currency, template, and governance risks.

Key points:

- Public policies may be missing, poorly named, hidden, duplicated, stale, or linked incorrectly.
- Internal policies may lack metadata, review dates, version control, or endorsement history.
- Existing policies can drift away from the latest Department template or omit mandatory clauses.
- Principals need remediation support, not just a list of exceptions.

### Slide 3: Three Operating Principles Govern the Architecture

Claim:

Rules decide what must be true; evidence proves what was found; workflow ensures accountable remediation.

Key points:

- Rules-first: Department obligations, review cadence, applicability, template versions, and endorsement requirements.
- Evidence-first: search queries, result ranks, crawl paths, files, extracted text, dates, metadata, confidence levels, and audit trails.
- Workflow-first: action plans, drafting, review, endorsement, publication, closure, and challenge processes.
- LLM acceleration sits inside these controls rather than replacing them.

### Slide 4: Six Product Capabilities Form the Platform

Claim:

The product spans discovery, compliance evaluation, reporting, drafting, governance, and continuous monitoring.

Key points:

- Public discovery orchestrator: finds required policies through search indexes, direct verification, and targeted crawling.
- Internal policy portal: manages non-public documents, versions, metadata, reviews, and approvals.
- Compliance engine: checks obligations, template alignment, review cadence, and endorsement rules.
- Reporting layer: state-wide dashboards, school action plans, and council governance reports.
- Drafting workspace: creates editable policy drafts from approved templates and validated school context.
- Workflow engine: routes remediation through review, endorsement, publication, and audit closure.

### Slide 5: Authoritative Data Sources Constrain the System

Claim:

Compliance and drafting quality depend on structured sources of truth, not freeform interpretation.

Key points:

- Policy obligation register: required policies, aliases, applicability, public/internal status, cadence, risk, roles, and evidence requirements.
- Department template library: current versions, superseded versions, release dates, protected clauses, optional fields, and local placeholders.
- School context profile: school type, campuses, year levels, governance, contacts, operations, council cycles, and publication preferences.
- Each school-specific fact must carry provenance so drafts can distinguish known facts from assumptions.

### Slide 6: Discovery Pipeline Captures Both Public and Internal Policy Evidence

Claim:

The platform builds a defensible inventory of what each school has published, uploaded, approved, and endorsed.

Key points:

- Search indexes first using bounded `site:` and `filetype:` queries, then directly fetch and verify candidate documents.
- Use targeted crawling for sitemaps, policy pages, navigation menus, document repositories, PDFs, DOCX files, and HTML content.
- Capture URLs, search provider, query, result rank, link text, page context, crawl path, HTTP status, file metadata, last-modified headers, and scan timestamps.
- Ingest internal policies through authenticated upload with metadata, ownership, review date, and endorsement status.
- Parse PDFs, DOCX, HTML, scanned files, headings, tables, dates, versions, approval statements, and endorsement information.

### Slide 7: Matching Is Evidence-Backed and Confidence-Rated

Claim:

Ambiguous documents should become review items, not silent compliance passes.

Key points:

- Use deterministic signals first: file names, headings, aliases, link text, page context, template phrases, metadata, and dates.
- Use LLM assistance for fuzzy naming, ambiguous classification, summarisation, and similarity analysis.
- Generate confidence levels: high, medium, low, or needs review.
- Attach evidence packs with source, timestamp, extracted text, matched requirement, rule applied, date evidence, template comparison, and confidence.
- Allow schools to challenge or correct findings with Department oversight.

### Slide 8: Compliance Is Multi-Dimensional, Not Pass/Fail

Claim:

A policy can exist while still being outdated, poorly published, non-aligned, inaccessible, or endorsement-pending.

Key dimensions:

- Existence: document found or uploaded.
- Availability: public policy is reachable from the school website.
- Discoverability: placed in expected navigation paths with clear link text.
- Currency: review date aligns with Department cadence.
- Template alignment: current version and mandatory clauses are present.
- Governance: approval and school council endorsement are complete where required.

### Slide 9: Reports Convert Findings Into Operational Action

Claim:

The value is not merely exception detection; it is prioritised remediation for each audience.

Key points:

- Department view: state-wide compliance by school, region, policy category, risk level, and remediation status.
- School view: prioritised action plan with next best step, responsible role, target date, evidence, template link, and draft status.
- Council view: endorsement obligations, overdue items, meeting-ready packs, approval decisions, and governance history.
- Exports include action registers, briefing packs, heatmaps, trend summaries, and evidence-backed exception reports.

### Slide 10: Drafting Is Controlled, Contextual, and Reviewable

Claim:

The drafting workspace should help schools complete templates without weakening Department control.

Key points:

- Start from the current Department template and preserve protected mandatory clauses.
- Populate editable local fields using validated school context and existing policy content.
- Compare current wording to the latest template and show redline-style guidance where possible.
- Highlight assumptions, missing facts, template changes, and sections needing principal confirmation.
- Support comments, edits, approval routing, council endorsement routing, final export, and publication tracking.

### Slide 11: LLMs and Agents Accelerate Work Inside Strict Guardrails

Claim:

AI can reduce administrative load, but final compliance, publication, and governance decisions remain human-controlled.

Key points:

- LLMs classify ambiguous documents, summarise findings, compare policy text, draft localised content, and ask targeted questions.
- LLMs do not make final statutory decisions, legal interpretations, review deadline calculations, publication decisions, or approvals.
- Bounded agents can retry site discovery, prepare exception explanations, compare documents, and create first drafts.
- Agents cannot publish policies, mark compliance resolved, send formal escalations, or approve governance outcomes without review.
- Prompts, sources, outputs, model versions, and reviewer decisions are logged.

### Slide 12: Recommended System Architecture

Claim:

A modular architecture separates sources of truth, evidence capture, rules, LLM acceleration, workflow, and reporting.

Key points:

- Core services: policy registry, template library, school profile service, public discovery orchestrator, search provider adapters, targeted crawler, document fetch and verification, ingestion pipeline, parser, classifier, evidence store, rules engine, drafting service, workflow engine, reporting layer, and audit service.
- Supabase Postgres relational database: schools, obligations, templates, review cadences, matches, findings, actions, workflows, approvals, endorsements, and audit events.
- Object storage: original documents, extracted files, screenshots, generated drafts, approved versions, and evidence packs.
- Vector search: selective semantic retrieval across templates, policies, and school context.
- Security: role-based access, encryption, retention policies, provider governance, privacy review, and immutable audit logs.

### Slide 13: End-to-End Remediation Pipeline

Claim:

Findings close only when evidence, approvals, and audit records support remediation.

Key points:

- Ingest Department obligations, template metadata, review calendars, and school profile data.
- Discover public documents through search indexes, direct verification, targeted crawling, and internal uploads.
- Parse, classify, and match documents to policy requirements.
- Run compliance rules and generate evidence-backed findings.
- Score and prioritise findings into action plans and dashboards.
- Draft missing or updated policies using templates and school context.
- Route through principal review, administrator edits, council endorsement, oversight where required, and publication or internal filing.

### Slide 14: Roadmap, Operating Model, and Success Measures

Claim:

The MVP should prove public compliance visibility first, then expand into internal governance and drafting productivity.

Key points:

- Phase 1: obligation register, template metadata, public discovery orchestrator, search index integration, targeted crawler, parser, classifier, rules engine, and Department dashboard.
- Phase 2: school action plans, evidence packs, correction workflows, and publication remediation tracking.
- Phase 3: internal policy portal with upload, version control, metadata capture, and internal checks.
- Phase 4: controlled drafting workspace using templates and school context profiles.
- Phase 5: school council workflows, meeting packs, reminders, and governance reporting.
- Measure: discoverability, template alignment, overdue reviews, time saved, endorsement timeliness, remediation speed, and audit readiness.

---

## 28. Recommended MVP Scope

The strongest MVP is public compliance reporting first.

MVP should include:

1. Department policy obligation register.
2. Department template metadata.
3. Authoritative school website list.
4. Public discovery orchestrator.
5. Search index provider integration.
6. Targeted public website crawler.
7. Document fetch and verification service.
8. PDF/DOCX/HTML parser.
9. Policy classifier.
10. Compliance rules engine.
11. Evidence store.
12. State-wide Department dashboard.
13. School-level exception reports.
14. Exportable action register.

This gives immediate Department value before introducing more sensitive drafting and internal policy management.

---

## 29. Supabase Postgres Deployment Model

Supabase Postgres is the selected managed Postgres capability for the structured policy assurance data store.

Supabase Postgres should hold the system-of-record relational data:

- Department policy requirements, aliases, template metadata, template versions, mandatory clauses, review rules, and applicability rules.
- School records, canonical website domains, CMS/site profiles, known policy pages, known document repositories, and document discovery playbook metadata.
- Site check runs, URL cache records, page snapshots, page links, discovered PDF metadata, extraction records, candidate matches, policy inventory rows, findings, and evidence pack references.
- Workflow state in later phases, including actions, assignments, approvals, council endorsement records, review history, publication state, and audit events.

Supabase should not be treated as the primary store for large immutable evidence unless the product explicitly adopts Supabase Storage. The architecture should keep a stable storage URI abstraction so evidence can live in Supabase Storage, S3, Azure Blob Storage, Google Cloud Storage, or a local filesystem during development.

### 29.1 Local Supabase Instance

The local development instance mirrors the intended cloud shape and is currently configured as follows:

- Supabase project id: `school_policy_compliance`.
- Supabase local stack command: `npm run supabase:start`.
- Supabase local database reset command: `npm run supabase:reset`.
- Full local database reset and Tecoma seed command: `npm run db:reset:local`.
- Supabase local Postgres runs on `127.0.0.1:54322`.
- Local database connection string: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Supabase Studio runs on `127.0.0.1:54323`.
- Supabase local API runs on `127.0.0.1:54321`.
- Supabase local GraphQL endpoint runs on `127.0.0.1:54321/graphql/v1`.
- Supabase local S3-compatible storage endpoint runs on `127.0.0.1:54321/storage/v1/s3`.
- Supabase local Inbucket email UI runs on `127.0.0.1:54324`.
- Local Supabase Postgres major version is currently configured to `15`.
- Local Redis for queue processing remains separate from Supabase and runs through Docker Compose on `localhost:6379`.
- Redis Commander runs on `localhost:8081`.

Local Supabase secrets, anon keys, service-role keys, S3 access keys, and JWT secrets are generated by the Supabase CLI and can be viewed with `supabase status`. They should not be committed to source control.

The local instance has been reset through Supabase migrations and seeded with:

- One Tecoma Primary School record.
- One Tecoma WordPress site profile.
- Ten temporary public policy requirements.
- No seeded discovery results; discovery results are generated by running the school check CLI.

The current Tecoma check command is:

```bash
npm run crawl:school -- --school "Tecoma Primary School" --live
```

The latest verified Tecoma check persisted:

- One completed `crawl_run`.
- Thirty-one `page_snapshot` rows.
- One thousand one hundred and thirty-seven `page_link` rows.
- Fifty `discovered_pdf` rows.
- Nine `policy_candidate_match` rows.
- Nine `school_policy_inventory` rows.
- One `compliance_finding` row for the missing `Child Safe Standards Policy`.

This confirms that CMS detection, WordPress sitemap discovery, candidate page checking, PDF candidate recording, in-memory policy matching, confidence scoring, inventory updates, and missing-policy findings are persisting into Supabase.

### 29.2 Schema and Migration Layout

The local development instance should mirror the cloud migration shape:

- SQL migrations live in `supabase/migrations`.
- The Drizzle schema in `packages/db/src/schema.ts` remains the application schema source used by TypeScript code.
- The generated Supabase migration creates the same tables, enums, indexes, and relationships captured in the architecture.
- Application scripts and services connect through `DATABASE_URL`, allowing the same code path for local Supabase, staging Supabase, and production Supabase.

Current Supabase migration files:

- `supabase/migrations/20260508000000_initial_policy_platform.sql`: creates the application enums, tables, indexes, and foreign keys.
- `supabase/migrations/20260508001000_enable_rls_for_application_tables.sql`: enables row level security on all application tables.
- `supabase/seed.sql`: intentionally minimal; application seed data is inserted by TypeScript scripts so local and cloud seed paths stay consistent.

The initial application tables covered by the Supabase schema include:

- Department registry tables: `department_sync_run`, `policy_requirement`, `policy_alias`, `policy_template`, `policy_template_content`, `policy_template_clause`, `policy_review_rule`, and `policy_applicability_rule`.
- School/site tables: `school` and `school_site_profile`.
- Discovery evidence tables: `crawl_run`, `crawl_url_cache`, `page_snapshot`, `page_link`, `discovered_pdf`, and `pdf_extraction`.
- Matching and compliance tables: `policy_candidate_match`, `school_policy_inventory`, `evidence_pack`, and `compliance_finding`.

### 29.3 Security Posture

- Server-side application services use a trusted Postgres connection string or service role secret stored in CI/CD and runtime secret managers.
- Client applications should not receive direct table-write permissions.
- Row level security is enabled by default on application tables exposed through Supabase APIs.
- Explicit read/write policies should be introduced only when the user-facing portal requires direct Supabase API access.
- Until direct client access is intentionally designed, application access should flow through trusted API services and workers.
- Audit fields, evidence packs, immutable run records, match confidence, and reviewer decisions should be preserved so compliance decisions remain explainable.

### 29.4 CI/CD Model

- GitHub Actions should run type checks, unit tests, and migration validation.
- Supabase migrations should be applied to staging before production.
- `DATABASE_URL`, `SUPABASE_URL`, service-role keys, Department API credentials, and model provider keys must be supplied through GitHub Actions secrets or cloud runtime secrets.
- Production jobs should run the Department policy metadata sync before compliance processing so obligation data is current.
- Site discovery jobs should write durable run records, evidence references, matches, inventory updates, and findings to Supabase Postgres.
- The repository includes a CI workflow that installs dependencies, runs TypeScript checks, installs the Supabase CLI, and validates the local migration set.
- The repository includes a manual Supabase migration workflow intended to link to a Supabase project and run `supabase db push` using GitHub environment secrets.

Required GitHub secrets for Supabase migration deployment:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

### 29.5 Cloud Deployment Notes

- The Supabase cloud project should use a Postgres major version aligned with `supabase/config.toml`.
- Local development is currently pinned to Postgres `15` because the local machine had the Supabase Postgres 15 image available and the Postgres 17 image pull was unreliable.
- Before production deployment, confirm the cloud Supabase Postgres major version and update `supabase/config.toml` if required.
- The application should use the Supabase direct or pooled Postgres connection string as `DATABASE_URL`.
- Supabase Auth can be adopted for the school/admin portal, but it is not required for the current CLI-led MVP.
- Supabase Storage can be adopted for page snapshots, PDF artifacts, extracted text, evidence packs, and generated policy drafts, but the system should keep storage references abstract through stable storage URIs.

---

## 30. Key Design Decisions

### 30.1 Compliance Decisions Should Be Deterministic

The rules engine should be the authority for compliance outcomes.

LLM-generated classification, summary, or comparison should be evidence inputs, not final decisions.

### 30.2 Drafting Should Be Template-Constrained

The drafting system should preserve Department template integrity.

Mandatory clauses should be locked, protected, or clearly distinguished from editable school-specific fields.

### 30.3 Evidence Should Be First-Class

Every report should link back to evidence.

This improves trust, auditability, and dispute resolution.

### 30.4 Workflow Should Drive Remediation

The application should not stop at reporting.

It should route users through actions required to fix the issue.

### 30.5 School Context Must Be Provenanced

The application should learn about each school, but every learned fact should have a source.

If a fact is missing, the system should prompt the school rather than invent it.

### 30.6 Public Discovery Should Be Index-First, Not Index-Only

Search APIs and MCP search tools should be used to discover candidate public policy documents before broad crawling.

This improves speed, reduces load on school websites, and helps find PDFs that are not obvious from navigation.

However, search results should not be treated as final compliance evidence. Candidate URLs must be fetched and verified directly, and absence from a search index should trigger targeted crawling or review rather than a conclusive missing-policy finding.

---

## 31. Implemented MVP Slice: School Policy Inventory View

This section records the implemented frontend and backend slice that supports the school-specific policy inventory view.

The current implementation allows a user to:

1. Open the web app landing page.
2. Search for or select a school.
3. Navigate to a school-specific policy inventory route.
4. Render school details, required policy rows, and summary charts from persisted database records.

### 31.1 Frontend Application

The frontend application is implemented as a new workspace app:

- App path: `apps/web`.
- Framework: TanStack Start with React and TypeScript.
- Build tooling: Vite.
- Styling: Tailwind CSS with custom application CSS tokens.
- UI primitives: Radix dropdown menu.
- Icons: `lucide-react`.

The frontend currently runs locally on:

```text
http://localhost:3000
```

The initial app shell includes:

- Top-left logo placeholder.
- Top-right user context menu placeholder for account, settings, billing, and login.
- Collapsible left-hand navigation with four placeholder menu items.
- ClawHub-inspired dark visual style, large central search, and quick-link chips.

The main school inventory route is:

```text
/schools/$schoolId
```

The current local test route is:

```text
http://localhost:3000/schools/tecoma-primary-school
```

The page is loaded through the TanStack route loader and calls the backend policy inventory API. The browser no longer owns compliance calculations; it renders the backend response.

### 31.2 Backend API

The Fastify API now exposes:

```text
GET /schools/:schoolId/policy-inventory
```

The API runs locally on:

```text
http://localhost:3001
```

The frontend reads the API base URL from:

```text
VITE_API_BASE_URL
```

Local development defaults to:

```text
VITE_API_BASE_URL=http://localhost:3001
```

The endpoint resolves schools by:

- UUID.
- Department school id.
- School-name slug, such as `tecoma-primary-school`.
- Exact lowercase school name.

The endpoint returns a single page payload containing:

- Evaluation date.
- School details.
- Summary counts for charts.
- Policy inventory rows.
- Per-policy compliance criteria.
- Evidence references.

The current response shape is:

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

### 31.3 Data Sources Used By The View

The policy inventory endpoint reads from the following relational tables:

- `school`.
- `policy_requirement`.
- `school_policy_inventory`.
- `discovered_pdf`.
- `policy_candidate_match`.
- `pdf_extraction`.

The view maps table data as follows:

- School name: `school.school_name`.
- School type: `school.school_type`.
- Region: `school.region`.
- Website URL: `school.website_url`.
- Last scan: `school.last_successful_crawl_at`.
- Policy name: `policy_requirement.canonical_name`.
- Present: current inventory row exists and is not marked missing.
- Public URL: `school_policy_inventory.public_url`.
- Approval date: `pdf_extraction.detected_approval_date`.
- Approved by: `pdf_extraction.detected_approvers`.
- Review cycle: normalized from `pdf_extraction.detected_review_cycle`.
- Next review: `pdf_extraction.detected_next_review_date`.
- Evidence: inventory id, discovered PDF id, match id, extraction id, PDF URL, extraction confidence, and human-review flag.

The local database currently has an older `school` table shape that does not include `address`, `principalName`, or `councilPresidentName`. The API returns these values as `null` until the school context profile model or school metadata sync provides them.

### 31.4 Compliance Evaluation Logic

The MVP compliance logic has been centralized in the rules package rather than the frontend.

Implemented helper:

```ts
evaluatePolicyInventoryRow({
  present,
  nextReviewDate,
  evaluationDate
})
```

The current MVP criteria are:

```ts
reviewDateInFuture =
  nextReviewDate !== null &&
  nextReviewDate > evaluationDate

compliant =
  present && reviewDateInFuture
```

The browser receives and renders:

- `present`.
- `criteria.reviewDateInFuture`.
- `compliant`.
- Summary counts derived from those criteria.

The browser does not recalculate compliance.

This boundary keeps future compliance expansion server-side. Additional criteria should be added as explicit backend criteria, for example:

- Current Department template alignment.
- Mandatory clause presence.
- Council endorsement completion.
- Public URL accessibility.
- Discoverability from expected navigation paths.
- Accessibility compliance.
- Duplicate or stale public versions.

### 31.5 Chart Calculations

The backend returns chart-ready summary counts.

Chart 1: policies found versus missing.

- Found: `summary.discoveredPolicyCount`.
- Missing: `summary.missingPolicyCount`.

Chart 2: review-compliant versus review-non-compliant.

- Review compliant: `summary.reviewCompliantCount`.
- Review non-compliant: `summary.reviewNonCompliantCount`.

Chart 3 remains a placeholder. The likely next use is template alignment once current Department template comparison is implemented.

### 31.6 Current Local Tecoma Result

The current local Tecoma policy inventory endpoint returns real table-backed data.

Latest verified local response summary:

- Required policy count: 11.
- Discovered policy count: 9.
- Missing policy count: 2.
- Review-compliant policy count: 3.
- Review-non-compliant policy count: 8.

This confirms that the frontend view is rendering dynamically from persisted backend tables rather than hardcoded mock rows.

### 31.7 Remaining Gaps For This Slice

The policy inventory view is functional, but the following gaps remain:

- School address, principal, and council president should move into a proper school context/profile data model.
- The API currently applies only simple `applies_to_all_schools` filtering; policy applicability rules should be evaluated before rows are returned.
- The worker app remains a queue/crawler scaffold; the CLI school check currently performs the richer persistence path.
- The API computes inventory compliance at request time; historical reporting will eventually need persisted evaluation snapshots with rule versions.
- The frontend should later replace placeholder search behavior with real school search/autocomplete.
- Chart 3 needs a real compliance dimension, most likely template alignment.

The next architecture step should be to formalize a runner/materialization service that moves the richer CLI persistence behavior into the worker pipeline.

---

## 32. Open Questions for Future Design

Questions to resolve during discovery:

- Which exact policies are required to be public?
- Which policies are internal-only?
- Which policies vary by school type?
- Which policy templates are legally mandatory versus recommended?
- Which template sections may schools edit?
- Which policies require school council endorsement?
- What are the authoritative school website URLs?
- Which search providers are approved for public document discovery, and what query volume, cost, retention, and data-use constraints apply?
- What search-result evidence is sufficient to support discovery history without relying on the search provider as the final source of truth?
- What school metadata is already available from Department systems?
- Which systems currently store Department templates?
- Which systems currently store internal school policies?
- What identity and access management system should be used?
- What privacy rules govern sending policy documents to an LLM provider?
- What level of Department oversight is required before closing findings?
- What export formats are required for school use?
- How should schools challenge or correct findings?
- What evidence is sufficient to prove publication?

---

## 33. Summary Recommendation

The platform should be designed as a trusted compliance and productivity system.

Its credibility should come from:

- Structured Department obligations.
- Deterministic rules.
- Traceable evidence.
- Role-based workflows.
- Human review and approval.
- Immutable audit history.

Its productivity value should come from:

- Automated discovery.
- Automated parsing.
- Assisted classification.
- Evidence-backed exception reporting.
- Prioritised action plans.
- Controlled LLM-assisted drafting.
- School context profiles.
- Approval and endorsement workflows.

The most important architectural boundary is that AI should accelerate work, not own accountability.

The right model is:

> Rules define the obligation. Evidence proves the state. Workflow drives remediation. LLMs accelerate the language work. Humans approve the outcome.
