import pLimit, { type LimitFunction } from "p-limit";
import type { ResolvedTarget } from "../config/schema.js";
import type { Severity } from "../checks/types.js";
import { captureArtifacts } from "./navigator.js";
import { launchSession } from "./session.js";
import { requiredCapabilities, requiredLhCategories, selectChecks } from "./registry.js";
import { runLighthouse } from "./lighthouse-runner.js";
import { evaluate, type AuditReport, type TargetReport } from "../budgets/evaluate.js";

export interface RunOptions {
  /** Max concurrent target navigations (static pool). */
  concurrency?: number;
  failOn?: Severity[];
  /** Injected clock for deterministic timestamps in tests. */
  now?: () => Date;
}

/**
 * Run all checks for a single target. Captures Playwright artifacts once, then
 * (only when a check needs it) runs Lighthouse against the same browser — but in
 * the serialized `perfLimit` pool so concurrent perf measurements never overlap.
 */
async function runTarget(
  target: ResolvedTarget,
  perfLimit: LimitFunction,
): Promise<TargetReport> {
  const checks = selectChecks(target.categories);
  const caps = requiredCapabilities(checks);

  try {
    const session = await launchSession(target);
    try {
      const artifacts = await captureArtifacts(session.browser, target);

      if (caps.has("lighthouse")) {
        const lhCategories = requiredLhCategories(checks);
        if (lhCategories.length > 0) {
          artifacts.lighthouse = await perfLimit(() =>
            runLighthouse(session, target, lhCategories),
          );
        }
      }

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
    } finally {
      await session.close();
    }
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
 * a bounded parallel pool; Lighthouse perf runs are serialized in a pool of 1 so
 * CPU-throttled measurements don't perturb one another.
 */
export async function runAudit(
  targets: ResolvedTarget[],
  options: RunOptions = {},
): Promise<AuditReport> {
  const now = options.now ?? (() => new Date());
  const limit = pLimit(options.concurrency ?? 4);
  const perfLimit = pLimit(1);
  const startedAt = now().toISOString();

  const reports = await Promise.all(
    targets.map((target) => limit(() => runTarget(target, perfLimit))),
  );

  const finishedAt = now().toISOString();
  return evaluate(reports, options.failOn ?? ["error"], { startedAt, finishedAt });
}
