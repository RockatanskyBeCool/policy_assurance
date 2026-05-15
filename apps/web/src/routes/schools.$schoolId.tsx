import { createFileRoute } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { ArrowUpRight, CalendarClock, FileCheck2, FileWarning } from 'lucide-react'

import { AppShell } from '../components/app-shell'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export const Route = createFileRoute('/schools/$schoolId')({
  loader: ({ params }) => fetchSchoolPolicyInventory(params.schoolId),
  pendingComponent: InventoryPending,
  errorComponent: InventoryError,
  component: SchoolPolicyInventoryView,
})

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
    linked?: boolean
    duplicates?: boolean
    approvalDate: string | null
    approvedBy: string[]
    reviewCycleYears: number | null
    nextReviewDate: string | null
    compliant: boolean
    criteria: {
      present: boolean
      linked?: boolean
      noDuplicateVersions?: boolean
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
      brokenLinkCount?: number
      duplicateFindingCount?: number
      duplicateCandidateCount?: number
    }
  }>
}

async function fetchSchoolPolicyInventory(schoolId: string): Promise<SchoolPolicyInventoryResponse> {
  const response = await fetch(`${apiBaseUrl}/schools/${encodeURIComponent(schoolId)}/policy-inventory`)

  if (!response.ok) {
    throw new Error(`Unable to load policy inventory (${response.status})`)
  }

  return response.json() as Promise<SchoolPolicyInventoryResponse>
}

function SchoolPolicyInventoryView() {
  const inventory = Route.useLoaderData()
  const { school, summary, policies } = inventory

  return (
    <AppShell>
      <main className="inventory-main">
        <section className="inventory-header">
          <div>
            <p className="eyebrow">School Specific Policy Inventory</p>
            <h1>{school.schoolName}</h1>
          </div>
          <div className="scan-pill">
            <CalendarClock size={16} aria-hidden="true" />
            Last scan: {formatDateTime(school.lastSuccessfulCrawlAt)}
          </div>
        </section>

        <section className="inventory-overview" aria-label="School policy overview">
          <SchoolDetailsCard inventory={inventory} />

          <div className="chart-grid">
            <MetricPieChart
              title="Policies found vs missing"
              value={summary.discoveredPolicyCount}
              total={summary.requiredPolicyCount}
            />
            <MetricPieChart
              title="Review compliant vs non compliant"
              value={summary.reviewCompliantCount}
              total={summary.requiredPolicyCount}
            />
            <MetricPieChart
              title="Placeholder"
              value={summary.placeholderCount}
              total={Math.max(summary.requiredPolicyCount, 1)}
            />
          </div>
        </section>

        <section className="inventory-table-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Policy Inventory</p>
              <h2>Required policy documents</h2>
            </div>
            <button className="subtle-button" type="button">
              View evidence
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Policy Name</th>
                  <th>Present</th>
                  <th>Linked?</th>
                  <th>Duplicates</th>
                  <th>Approval Date</th>
                  <th>Approved By</th>
                  <th>Review Cycle</th>
                  <th>Next Review</th>
                  <th>Compliant</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => {
                  const linked = hasHealthyPolicyLink(policy)
                  const duplicates = hasDuplicatePolicyLinks(policy)

                  return (
                    <tr key={policy.policyRequirementId}>
                      <td>
                        <span className="policy-name">{policy.policyName}</span>
                      </td>
                      <td>
                        <StatusBadge value={policy.present} positiveLabel="Yes" negativeLabel="No" />
                      </td>
                      <td>
                        <StatusBadge value={linked} positiveLabel="Yes" negativeLabel="No" />
                      </td>
                      <td>
                        <StatusBadge
                          value={duplicates}
                          positiveLabel="Yes"
                          negativeLabel="No"
                          tone={duplicates ? 'negative' : 'neutral'}
                        />
                      </td>
                      <td>{formatDate(policy.approvalDate)}</td>
                      <td>{policy.approvedBy.length > 0 ? policy.approvedBy.join(', ') : 'Not found'}</td>
                      <td>{policy.reviewCycleYears ? `${policy.reviewCycleYears} years` : 'Not found'}</td>
                      <td>{formatDate(policy.nextReviewDate)}</td>
                      <td>
                        <StatusBadge
                          value={policy.compliant}
                          positiveLabel="Yes"
                          negativeLabel="No"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function InventoryPending() {
  return (
    <AppShell>
      <main className="inventory-main">
        <div className="inventory-state-card">Loading policy inventory...</div>
      </main>
    </AppShell>
  )
}

function InventoryError({ error }: Readonly<{ error: Error }>) {
  return (
    <AppShell>
      <main className="inventory-main">
        <div className="inventory-state-card">
          <p className="eyebrow">Inventory unavailable</p>
          <h1>Could not load this school</h1>
          <p>{error.message}</p>
        </div>
      </main>
    </AppShell>
  )
}

function SchoolDetailsCard({ inventory }: Readonly<{ inventory: SchoolPolicyInventoryResponse }>) {
  const { school } = inventory

  return (
    <article className="school-details-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">School Details</p>
          <h2>Profile</h2>
        </div>
        <FileCheck2 size={20} aria-hidden="true" />
      </div>
      <dl className="school-details-list">
        <div>
          <dt>School Name</dt>
          <dd>{school.schoolName}</dd>
        </div>
        <div>
          <dt>School Address</dt>
          <dd>{school.address ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Principal</dt>
          <dd>{school.principalName ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Council President</dt>
          <dd>{school.councilPresidentName ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>{school.region ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>School Type</dt>
          <dd>{school.schoolType ?? 'Not recorded'}</dd>
        </div>
      </dl>
    </article>
  )
}

type MetricPieChartProps = Readonly<{
  title: string
  value: number
  total: number
}>

function MetricPieChart({
  title,
  value,
  total,
}: MetricPieChartProps) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <article className="chart-card">
      <div className="chart-card-top">
        <h2>{title}</h2>
        <FileWarning size={17} aria-hidden="true" />
      </div>
      <div className="pie-chart" style={{ '--pie-value': `${percent}%` } as CSSProperties}>
        <span>{percent}%</span>
      </div>
    </article>
  )
}

type StatusBadgeProps = Readonly<{
  value: boolean
  positiveLabel: string
  negativeLabel: string
  tone?: 'auto' | 'positive' | 'negative' | 'neutral'
}>

function StatusBadge({ value, positiveLabel, negativeLabel, tone = 'auto' }: StatusBadgeProps) {
  const resolvedTone = tone === 'auto' ? (value ? 'positive' : 'negative') : tone

  return (
    <span className="status-badge" data-positive={value} data-tone={resolvedTone}>
      {value ? positiveLabel : negativeLabel}
    </span>
  )
}

type InventoryPolicy = SchoolPolicyInventoryResponse['policies'][number]

function hasHealthyPolicyLink(policy: InventoryPolicy) {
  if (typeof policy.linked === 'boolean') {
    return policy.linked
  }

  if (typeof policy.evidence.brokenLinkCount === 'number') {
    return policy.present && policy.evidence.brokenLinkCount === 0
  }

  return policy.present
}

function hasDuplicatePolicyLinks(policy: InventoryPolicy) {
  if (typeof policy.duplicates === 'boolean') {
    return policy.duplicates
  }

  return (policy.evidence.duplicateCandidateCount ?? 0) > 1 || (policy.evidence.duplicateFindingCount ?? 0) > 0
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not found'
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
