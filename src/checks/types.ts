import type { PageArtifacts } from "../core/artifacts.js";
import type { ResolvedTarget } from "../config/schema.js";

/** The six audit categories. */
export const CATEGORIES = [
  "security",
  "privacy",
  "performance",
  "accessibility",
  "seo",
  "best-practices",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Capabilities a check may require from the orchestrator before it can run. */
export type Capability = "artifacts" | "lighthouse" | "axe" | "tls";

/** Severity of an individual finding. */
export type Severity = "error" | "warning" | "info";

/** Outcome status of a check as a whole. */
export type CheckStatus = "pass" | "warn" | "fail" | "info" | "skip";

/** A single human-readable observation produced by a check. */
export interface Finding {
  severity: Severity;
  /** Short, stable summary of the issue. */
  message: string;
  /** Optional remediation guidance. */
  remediation?: string;
  /** Optional pointer to docs/help. */
  helpUrl?: string;
  /** Optional structured detail (e.g. the offending header value). */
  detail?: Record<string, unknown>;
}

/** The result of running one check against one target. */
export interface CheckResult {
  id: string;
  category: Category;
  status: CheckStatus;
  /** Normalized 0..1 score where meaningful (optional). */
  score?: number;
  /** Raw values for JSON output and trend tracking. */
  observations: Record<string, unknown>;
  /** Human-readable findings, each with a severity. */
  findings: Finding[];
}

/** Everything a check needs to do its work. */
export interface CheckContext {
  target: ResolvedTarget;
  artifacts: PageArtifacts;
}

/** The plugin contract every check implements. */
export interface Check {
  /** Stable dotted id, e.g. "security.headers". */
  id: string;
  category: Category;
  /** What this check needs captured before it can run. */
  needs: Capability[];
  run(ctx: CheckContext): Promise<CheckResult> | CheckResult;
}

/** Helper for checks to build a result with sensible defaults. */
export function makeResult(
  check: Pick<Check, "id" | "category">,
  partial: Partial<Omit<CheckResult, "id" | "category">>,
): CheckResult {
  return {
    id: check.id,
    category: check.category,
    status: partial.status ?? "info",
    score: partial.score,
    observations: partial.observations ?? {},
    findings: partial.findings ?? [],
  };
}
