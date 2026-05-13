import { eq } from "drizzle-orm";
import { createDb, schema } from "@school-policy/db";
import { temporaryPolicies, tecomaSchool } from "./local-test-data.js";

const db = createDb();

const [existingSchool] = await db.select().from(schema.schools).where(eq(schema.schools.departmentSchoolId, tecomaSchool.departmentSchoolId));
const school =
  existingSchool ??
  (
    await db
      .insert(schema.schools)
      .values({
        departmentSchoolId: tecomaSchool.departmentSchoolId,
        schoolName: tecomaSchool.schoolName,
        schoolType: tecomaSchool.schoolType,
        state: tecomaSchool.state,
        websiteUrl: tecomaSchool.websiteUrl,
        canonicalDomain: tecomaSchool.canonicalDomain,
        status: "active"
      })
      .returning()
  )[0];

if (!school) throw new Error("Failed to create Tecoma school record");

const [existingProfile] = await db.select().from(schema.schoolSiteProfiles).where(eq(schema.schoolSiteProfiles.schoolId, school.id));
const profileValues = {
  homepageUrl: tecomaSchool.websiteUrl,
  knownPolicyPageUrl: "https://tecomaps.vic.edu.au/newsletters-forms/",
  knownDocumentRepositoryUrl: "https://tecomaps.vic.edu.au/newsletters-forms/",
  cmsType: "wordpress",
  sitemapUrl: "https://tecomaps.vic.edu.au/wp-sitemap.xml",
  robotsUrl: "https://tecomaps.vic.edu.au/robots.txt",
  crawlStrategy: "wordpress_playbook",
  crawlDepthLimit: 5,
  knownPolicyPages: [
    "https://tecomaps.vic.edu.au/newsletters-forms/",
    "https://tecomaps.vic.edu.au/out-of-school-hours-care/"
  ],
  knownDocumentPages: ["https://tecomaps.vic.edu.au/newsletters-forms/"],
  knownPdfPatterns: ["https://tecomaps.vic.edu.au/wp-content/uploads/"],
  lastProfiledAt: new Date()
};

if (existingProfile) {
  await db.update(schema.schoolSiteProfiles).set(profileValues).where(eq(schema.schoolSiteProfiles.id, existingProfile.id));
} else {
  await db.insert(schema.schoolSiteProfiles).values({
    schoolId: school.id,
    ...profileValues
  });
}

let policyCount = 0;
for (const policy of temporaryPolicies) {
  const [existingPolicy] = await db
    .select()
    .from(schema.policyRequirements)
    .where(eq(schema.policyRequirements.departmentPolicyId, policy.departmentPolicyId));

  const policyValues = {
    departmentPolicyId: policy.departmentPolicyId,
    canonicalName: policy.canonicalName,
    requirementForLocalPolicy: policy.requirementForLocalPolicy,
    sourceOfRequirement: policy.sourceOfRequirement,
    policyCategory: policy.category ?? "temporary_test",
    description: policy.description ?? `Temporary policy requirement for local testing: ${policy.canonicalName}`,
    visibility: policy.visibility,
    appliesToAllSchools: true,
    riskLevel: policy.riskLevel,
    councilEndorsementRequired: policy.councilEndorsementRequired,
    localPolicyTemplateLink: policy.localPolicyTemplateLink,
    templateLastUpdatedAt: policy.templateLastUpdatedAt ? new Date(policy.templateLastUpdatedAt) : undefined,
    reviewCycle: policy.reviewCycle,
    approvalRequirements: policy.approvalRequirements,
    consultationRequirements: policy.consultationRequirements,
    requiredCommunicationMethods: policy.requiredCommunicationMethods,
    recommendedCommunicationMethods: policy.recommendedCommunicationMethods,
    relatedPalPolicy: policy.relatedPalPolicy,
    status: "active" as const,
    sourceUpdatedAt: policy.sourceUpdatedAt ? new Date(policy.sourceUpdatedAt) : new Date()
  };

  const policyRow =
    existingPolicy
      ? (
          await db
            .update(schema.policyRequirements)
            .set(policyValues)
            .where(eq(schema.policyRequirements.id, existingPolicy.id))
            .returning()
        )[0]
      : (await db.insert(schema.policyRequirements).values(policyValues).returning())[0];

  if (!policyRow) throw new Error(`Failed to create policy ${policy.canonicalName}`);
  policyCount += 1;

  const aliases = await db.select().from(schema.policyAliases).where(eq(schema.policyAliases.policyRequirementId, policyRow.id));
  for (const alias of policy.aliases) {
    if (!aliases.some((existingAlias) => existingAlias.aliasText === alias)) {
      await db.insert(schema.policyAliases).values({
        policyRequirementId: policyRow.id,
        aliasText: alias,
        aliasType: "temporary",
        source: "local_test",
        confidence: "1"
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      schoolId: school.id,
      schoolName: school.schoolName,
      siteProfile: "ready",
      temporaryPolicies: policyCount
    },
    null,
    2
  )
);
