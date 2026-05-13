import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export function loadWorkspaceEnv(startDir = process.cwd()): void {
  const envPath = findUp(".env", startDir);
  if (envPath) {
    dotenv.config({ path: envPath, quiet: true });
  } else {
    dotenv.config({ quiet: true });
  }
}

function findUp(filename: string, startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
