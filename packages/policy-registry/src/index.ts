import { departmentPolicyRecordSchema, type DepartmentPolicyRecord } from "@school-policy/shared";

export interface DepartmentPolicyApiClientOptions {
  baseUrl: string;
  token?: string;
}

export class DepartmentPolicyApiClient {
  constructor(private readonly options: DepartmentPolicyApiClientOptions) {}

  async listPolicies(): Promise<DepartmentPolicyRecord[]> {
    const url = new URL("/policies", this.options.baseUrl);
    const response = await fetch(url, {
      headers: this.options.token ? { authorization: `Bearer ${this.options.token}` } : undefined
    });

    if (!response.ok) {
      throw new Error(`Department policy API failed: ${response.status} ${response.statusText}`);
    }

    const payload: unknown = await response.json();
    const records = Array.isArray(payload) ? payload : (payload as { policies?: unknown[] }).policies;

    if (!Array.isArray(records)) {
      throw new Error("Department policy API response must be an array or { policies: [] }");
    }

    return records.map((record) => departmentPolicyRecordSchema.parse(record));
  }
}

export interface PolicyRegistrySyncSummary {
  seen: number;
  activePolicyIds: string[];
}

export async function fetchDepartmentPolicySnapshot(client: DepartmentPolicyApiClient): Promise<PolicyRegistrySyncSummary> {
  const policies = await client.listPolicies();
  return {
    seen: policies.length,
    activePolicyIds: policies.map((policy) => policy.departmentPolicyId)
  };
}
