import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AuditReport } from "../budgets/evaluate.js";

/**
 * JSON reporter — the canonical artifact. Writes the full report (including raw
 * observations) so results can be diffed and trend-tracked over time.
 */
export function writeJsonReport(report: AuditReport, outPath: string): string {
  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(report, null, 2), "utf8");
  return absolute;
}
