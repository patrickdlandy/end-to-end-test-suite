import pLimit, { type LimitFunction } from "p-limit";
import type { Politeness, ResolvedTarget } from "../config/schema.js";
import { politenessSchema } from "../config/schema.js";
import { makeResult, type Severity } from "../checks/types.js";
import { captureArtifacts } from "./navigator.js";
import { launchSession } from "./session.js";
import { requiredCapabilities, requiredLhCategories, selectChecks } from "./registry.js";
import { runLighthouse } from "./lighthouse-runner.js";
import { captureTls } from "./tls.js";
import { crawlSeed, loadRobots, robotsAllows, type CrawlResult } from "./crawl.js";
import { HostThrottle } from "./throttle.js";
import { hostOf } from "../util/domain.js";
import { evaluate, type AuditReport } from "../budgets/evaluate.js";

export interface RunOptions {
  /** Max concurrent target navigations (overrides politeness.maxConcurrency). */
  concurrency?: number;
  failOn?: Severity[];
  /** Run-level politeness controls; defaults applied when omitted. */
  politeness?: Politeness;
  /** Injected clock for deterministic timestamps in tests. */
  now?: () => Date;
}

/**
 * Run all checks for a single target. Captures Playwright artifacts once, then
 * (only when a check needs it) runs Lighthouse against the same browser — but in
 * the serialized `perfLimit` pool so concurrent perf measurements never overlap.
 * A per-host throttle spaces same-host navigations before capture.
 */
async function runTarget(
  target: ResolvedTarget,
  perfLimit: LimitFunction,
  throttle: HostThrottle,
  minIntervalMs: number,
): Promise<CrawlResult> {
  const checks = selectChecks(target.categories);
  const caps = requiredCapabilities(checks);

  try {
    await throttle.acquire(hostOf(target.url));
    const session = await launchSession(target);
    try {
      const artifacts = await captureArtifacts(session.browser, target, caps);

      if (caps.has("tls")) {
        artifacts.tls = await captureTls(target);
      }

      if (caps.has("lighthouse")) {
        const lhCategories = requiredLhCategories(checks);
        if (lhCategories.length > 0) {
          artifacts.lighthouse = await perfLimit(() =>
            runLighthouse(session, target, lhCategories, minIntervalMs),
          );
        }
      }

      const results = [];
      for (const check of checks) {
        results.push(await check.run({ target, artifacts }));
      }
      return {
        report: {
          url: target.url,
          finalUrl: artifacts.finalUrl,
          status: artifacts.status,
          ok: true,
          results,
          captureDurationMs: artifacts.captureDurationMs,
        },
        links: artifacts.links,
      };
    } finally {
      await session.close();
    }
  } catch (err) {
    return {
      report: {
        url: target.url,
        finalUrl: target.url,
        status: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        results: [],
        captureDurationMs: 0,
      },
      links: [],
    };
  }
}

/** A robots-disallowed primary target: skipped without navigating. */
function robotsSkippedReport(target: ResolvedTarget): CrawlResult {
  return {
    report: {
      url: target.url,
      finalUrl: target.url,
      status: 0,
      ok: true,
      results: [
        makeResult(
          { id: "robots.respect", category: "best-practices" },
          {
            status: "skip",
            findings: [
              {
                severity: "info",
                message: "Skipped: disallowed by robots.txt (politeness.respectRobots).",
              },
            ],
          },
        ),
      ],
      captureDurationMs: 0,
    },
    links: [],
  };
}

/** True when politeness.respectRobots forbids auditing this primary target. */
async function robotsForbids(target: ResolvedTarget): Promise<boolean> {
  try {
    const url = new URL(target.url);
    const rules = await loadRobots(url.origin, target.timeoutMs);
    return !robotsAllows(rules, url.pathname);
  } catch {
    return false;
  }
}

/**
 * Orchestrate an audit run across all targets. Navigation + static checks run in
 * a bounded parallel pool; Lighthouse perf runs are serialized in a pool of 1 so
 * CPU-throttled measurements don't perturb one another. A per-host throttle keeps
 * same-host requests polite, and (optionally) robots.txt gates primary targets.
 */
export async function runAudit(
  targets: ResolvedTarget[],
  options: RunOptions = {},
): Promise<AuditReport> {
  const now = options.now ?? (() => new Date());
  const politeness = options.politeness ?? politenessSchema.parse({});
  const limit = pLimit(options.concurrency ?? politeness.maxConcurrency);
  const perfLimit = pLimit(1);
  const throttle = new HostThrottle({
    minIntervalMs: politeness.minRequestIntervalMs,
    throttleLocalhost: politeness.throttleLocalhost,
  });
  const startedAt = now().toISOString();

  const runOne = (target: ResolvedTarget) =>
    runTarget(target, perfLimit, throttle, politeness.minRequestIntervalMs);

  const perSeed = await Promise.all(
    targets.map((seed) =>
      limit(async () => {
        if (politeness.respectRobots && (await robotsForbids(seed))) {
          return [robotsSkippedReport(seed).report];
        }
        if (seed.crawl && seed.crawl.maxDepth > 0) {
          return crawlSeed(seed, seed.crawl, runOne);
        }
        const { report } = await runOne(seed);
        return [report];
      }),
    ),
  );

  const finishedAt = now().toISOString();
  return evaluate(perSeed.flat(), options.failOn ?? ["error"], { startedAt, finishedAt });
}
