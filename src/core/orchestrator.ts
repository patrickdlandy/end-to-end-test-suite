import pLimit from "p-limit";
import type { ResolvedTarget } from "../config/schema.js";
import type { Severity } from "../checks/types.js";
import { capture } from "./navigator.js";
import { selectChecks } from "./registry.js";
import { evaluate, type AuditReport, type TargetReport } from "../budgets/evaluate.js";

export interface RunOptions {
  /** Max concurrent target navigations (static pool). */
  concurrency?: number;
  failOn?: Severity[];
  /** Injected clock for deterministic timestamps in tests. */
  now?: () => Date;
}

/** Run all checks for a single target, capturing artifacts once. */
async function runTarget(target: ResolvedTarget): Promise<TargetReport> {
  const checks = selectChecks(target.categories);
  try {
    const artifacts = await capture(target);
    const results = [];
    for (const check of checks) {
      results.push(await check.run({ target, artifacts }));
    }
    return {
      url: target.url,
      finalUrl: artifacts.finalUrl,
      status: artifacts.status,
      ok: true,
      results,
      captureDurationMs: artifacts.captureDurationMs,
    };
  } catch (err) {
    return {
      url: target.url,
      finalUrl: target.url,
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      results: [],
      captureDurationMs: 0,
    };
  }
}

/**
 * Orchestrate an audit run across all targets. Navigation + static checks run in
 * a bounded parallel pool. (A serialized Lighthouse perf pool is added in Phase 1.)
 */
export async function runAudit(
  targets: ResolvedTarget[],
  options: RunOptions = {},
): Promise<AuditReport> {
  const now = options.now ?? (() => new Date());
  const limit = pLimit(options.concurrency ?? 4);
  const startedAt = now().toISOString();

  const reports = await Promise.all(
    targets.map((target) => limit(() => runTarget(target))),
  );

  const finishedAt = now().toISOString();
  return evaluate(reports, options.failOn ?? ["error"], { startedAt, finishedAt });
}
