import lighthouse, { desktopConfig } from "lighthouse";
import type { BrowserSession } from "./session.js";
import type { ResolvedTarget } from "../config/schema.js";

/** Lighthouse category ids we support reading. */
export type LhCategory = "performance" | "accessibility" | "seo" | "best-practices";

/** Lab metrics extracted from a Lighthouse run. */
export interface LighthouseMetrics {
  /** Largest Contentful Paint, ms. */
  lcpMs?: number;
  /** Cumulative Layout Shift, unitless. */
  cls?: number;
  /** Total Blocking Time, ms — the lab proxy for INP. */
  tbtMs?: number;
  /** First Contentful Paint, ms. */
  fcpMs?: number;
  /** Speed Index, ms. */
  speedIndexMs?: number;
  /** Time to Interactive, ms. */
  ttiMs?: number;
}

/** Normalized, median-aggregated Lighthouse result for a target. */
export interface LighthouseResult {
  /** 0..1 category scores, keyed by Lighthouse category id. */
  categoryScores: Partial<Record<LhCategory, number>>;
  /** Median lab metrics across all runs. */
  metrics: LighthouseMetrics;
  /** Number of runs aggregated. */
  runs: number;
}

interface SingleRun {
  categoryScores: Partial<Record<LhCategory, number>>;
  metrics: LighthouseMetrics;
}

/** The Lighthouse result object (`lhr`), inferred from the library's return type. */
type Lhr = NonNullable<Awaited<ReturnType<typeof lighthouse>>>["lhr"];

/** Median of a numeric list; undefined when empty. Even counts average the middle two. */
export function median(values: number[]): number | undefined {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return undefined;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return ((nums[mid - 1] as number) + (nums[mid] as number)) / 2;
}

/** Pull the metrics/scores we care about out of a raw Lighthouse result object. */
function extractRun(lhr: Lhr, categories: LhCategory[]): SingleRun {
  const audit = (id: string): number | undefined => {
    const value = lhr.audits[id]?.numericValue;
    return typeof value === "number" ? value : undefined;
  };

  const categoryScores: Partial<Record<LhCategory, number>> = {};
  for (const cat of categories) {
    const score = lhr.categories[cat]?.score;
    if (typeof score === "number") categoryScores[cat] = score;
  }

  return {
    categoryScores,
    metrics: {
      lcpMs: audit("largest-contentful-paint"),
      cls: audit("cumulative-layout-shift"),
      tbtMs: audit("total-blocking-time"),
      fcpMs: audit("first-contentful-paint"),
      speedIndexMs: audit("speed-index"),
      ttiMs: audit("interactive"),
    },
  };
}

/** Median across runs for each metric/score field. */
function aggregate(runs: SingleRun[], categories: LhCategory[]): LighthouseResult {
  const metricKeys: (keyof LighthouseMetrics)[] = [
    "lcpMs",
    "cls",
    "tbtMs",
    "fcpMs",
    "speedIndexMs",
    "ttiMs",
  ];
  const metrics: LighthouseMetrics = {};
  for (const key of metricKeys) {
    const m = median(runs.map((r) => r.metrics[key]).filter((v): v is number => v !== undefined));
    if (m !== undefined) metrics[key] = m;
  }

  const categoryScores: Partial<Record<LhCategory, number>> = {};
  for (const cat of categories) {
    const s = median(
      runs.map((r) => r.categoryScores[cat]).filter((v): v is number => v !== undefined),
    );
    if (s !== undefined) categoryScores[cat] = s;
  }

  return { categoryScores, metrics, runs: runs.length };
}

/**
 * Run Lighthouse against the session's Chromium `target.runs` times and return
 * median-aggregated metrics. The caller serializes invocations (perf pool = 1)
 * so concurrent runs don't perturb each other's CPU-throttled measurements.
 */
export async function runLighthouse(
  session: BrowserSession,
  target: ResolvedTarget,
  categories: LhCategory[],
): Promise<LighthouseResult> {
  const config = target.device === "desktop" ? desktopConfig : undefined;
  const runs: SingleRun[] = [];

  for (let i = 0; i < target.runs; i++) {
    const runnerResult = await lighthouse(
      target.url,
      {
        port: session.port,
        output: "json",
        logLevel: "silent",
        onlyCategories: categories,
      },
      config,
    );
    if (runnerResult?.lhr) {
      runs.push(extractRun(runnerResult.lhr, categories));
    }
  }

  if (runs.length === 0) {
    throw new Error("Lighthouse produced no results");
  }
  return aggregate(runs, categories);
}
