import path from "node:path";

export function storageRoot(): string {
  return process.env.OBJECT_STORAGE_ROOT ?? path.resolve(process.cwd(), "storage");
}

export function schoolStoragePrefix(schoolId: string): string {
  return path.join("schools", schoolId);
}

export function crawlRunStoragePrefix(schoolId: string, crawlRunId: string): string {
  return path.join(schoolStoragePrefix(schoolId), "crawl-runs", crawlRunId);
}

export function departmentTemplateStoragePrefix(templateId: string, version: string): string {
  return path.join("department", "templates", templateId, version);
}

export function evidencePackStoragePrefix(findingId: string): string {
  return path.join("evidence-packs", findingId);
}
