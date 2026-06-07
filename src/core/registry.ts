import type { Capability, Category, Check } from "../checks/types.js";
import { securityHeadersCheck } from "../checks/security/security-headers.js";
import { lighthousePerfCheck } from "../checks/performance/lighthouse-perf.js";
import type { LhCategory } from "./lighthouse-runner.js";

/**
 * The registry of all available checks. New checks are added here; the
 * orchestrator selects from this list based on each target's enabled categories.
 */
export const ALL_CHECKS: Check[] = [securityHeadersCheck, lighthousePerfCheck];

/** Map our audit categories to the Lighthouse category ids they read. */
const CATEGORY_TO_LH: Partial<Record<Category, LhCategory>> = {
  performance: "performance",
  accessibility: "accessibility",
  seo: "seo",
  "best-practices": "best-practices",
};

/** Lighthouse categories needed by a set of checks that require Lighthouse. */
export function requiredLhCategories(checks: Check[]): LhCategory[] {
  const cats = new Set<LhCategory>();
  for (const check of checks) {
    if (!check.needs.includes("lighthouse")) continue;
    const lh = CATEGORY_TO_LH[check.category];
    if (lh) cats.add(lh);
  }
  return [...cats];
}

/** Checks whose category is enabled for a target. */
export function selectChecks(enabledCategories: Category[]): Check[] {
  const enabled = new Set(enabledCategories);
  return ALL_CHECKS.filter((check) => enabled.has(check.category));
}

/** Union of capabilities required by a set of checks. */
export function requiredCapabilities(checks: Check[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const check of checks) {
    for (const cap of check.needs) caps.add(cap);
  }
  return caps;
}
