import fs from "node:fs";
import path from "node:path";

/**
 * Saved returns live outside the app directory. Each Hostinger deploy
 * replaces the app folder, the same way the finance dashboard keeps
 * finance-data/ as a sibling. Set TAXES_DATA_PATH to an absolute path
 * in hPanel. The default is a sibling folder named taxes-data.
 */
export function taxesDataPath(): string {
  const configured = process.env.TAXES_DATA_PATH?.trim();
  const dir = configured
    ? configured
    : path.resolve(process.cwd(), "..", "taxes-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function returnFilePath(): string {
  return path.join(taxesDataPath(), "return.json");
}

export function lastRunDir(): string {
  const dir = path.join(taxesDataPath(), "last-run");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
