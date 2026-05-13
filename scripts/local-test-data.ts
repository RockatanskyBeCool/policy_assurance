import type { DepartmentPolicyRecord } from "@school-policy/shared";

export const tecomaSchool = {
  departmentSchoolId: "TEMP-TECOMA-PS",
  schoolName: "Tecoma Primary School",
  schoolType: "primary",
  state: "Victoria",
  websiteUrl: "https://tecomaps.vic.edu.au/",
  canonicalDomain: "tecomaps.vic.edu.au"
};

export const temporaryPolicies: DepartmentPolicyRecord[] = [
  "Child Safety Policy",
  "Child Safe Standards Policy",
  "Student Wellbeing and Engagement Policy",
  "Complaints Policy",
  "Privacy Policy",
  "Anaphylaxis Policy",
  "Attendance Policy",
  "Yard Duty and Supervision Policy",
  "Bullying Prevention Policy",
  "Digital Learning Policy"
].map((name, index) => ({
  departmentPolicyId: `TEMP-${String(index + 1).padStart(3, "0")}`,
  canonicalName: name,
  visibility: "public",
  riskLevel: index < 3 ? "critical" : "medium",
  councilEndorsementRequired: false,
  aliases: [name],
  reviewCadenceMonths: 24
}));

export const commonPolicyPaths = [
  "/policies",
  "/policy",
  "/school-policies",
  "/our-school/policies",
  "/about/policies",
  "/about-us/policies",
  "/resources",
  "/documents",
  "/downloads",
  "/parent-information",
  "/parents",
  "/community"
];
