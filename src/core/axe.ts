import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";

export type AxeImpact = "critical" | "serious" | "moderate" | "minor";

/** A single axe-core violation, summarized for reporting. */
export interface AxeViolation {
  id: string;
  impact: AxeImpact | "unknown";
  help: string;
  helpUrl: string;
  /** Number of DOM nodes affected. */
  nodeCount: number;
  /** A few example CSS selectors for the affected nodes. */
  sampleTargets: string[];
}

/** Summary of an axe-core run against a page. */
export interface AxeSummary {
  violations: AxeViolation[];
  counts: Record<AxeImpact, number>;
  passes: number;
  incomplete: number;
}

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Run axe-core against a live page, tagged for WCAG 2.x AA. Called during the
 * capture while the page is still open, so results travel in PageArtifacts and
 * checks remain pure analyzers.
 */
export async function captureAxe(page: Page): Promise<AxeSummary> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const counts: Record<AxeImpact, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };

  const violations: AxeViolation[] = results.violations.map((v) => {
    const impact = (v.impact ?? "unknown") as AxeViolation["impact"];
    if (impact !== "unknown") counts[impact] += 1;
    return {
      id: v.id,
      impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
      sampleTargets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    };
  });

  return {
    violations,
    counts,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
  };
}
