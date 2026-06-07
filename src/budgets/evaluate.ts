import type { CheckResult, Severity } from "../checks/types.js";

/** Per-target audit result: all check results plus capture metadata. */
export interface TargetReport {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  /** Present when the navigation itself failed. */
  error?: string;
  results: CheckResult[];
  captureDurationMs: number;
}

/** Top-level audit report — the canonical object every reporter consumes. */
export interface AuditReport {
  startedAt: string;
  finishedAt: string;
  targets: TargetReport[];
  summary: {
    targetCount: number;
    totalChecks: number;
    failedChecks: number;
    errorFindings: number;
    warningFindings: number;
    /** True when the run should fail the build given ci.failOn. */
    failed: boolean;
  };
}

/** Count findings of a given severity across a report. */
function countFindings(targets: TargetReport[], severity: Severity): number {
  let count = 0;
  for (const t of targets) {
    for (const r of t.results) {
      count += r.findings.filter((f) => f.severity === severity).length;
    }
  }
  return count;
}

/**
 * Decide whether the run should fail the build. A run fails when any finding's
 * severity is in `failOn`, or when a target failed to navigate at all.
 */
export function evaluate(
  targets: TargetReport[],
  failOn: Severity[],
  meta: { startedAt: string; finishedAt: string },
): AuditReport {
  const failSet = new Set(failOn);
  const errorFindings = countFindings(targets, "error");
  const warningFindings = countFindings(targets, "warning");

  let failedChecks = 0;
  let totalChecks = 0;
  let triggeredFail = false;

  for (const t of targets) {
    if (!t.ok) triggeredFail = true;
    for (const r of t.results) {
      totalChecks += 1;
      if (r.status === "fail") failedChecks += 1;
      if (r.findings.some((f) => failSet.has(f.severity))) triggeredFail = true;
    }
  }

  return {
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    targets,
    summary: {
      targetCount: targets.length,
      totalChecks,
      failedChecks,
      errorFindings,
      warningFindings,
      failed: triggeredFail,
    },
  };
}
