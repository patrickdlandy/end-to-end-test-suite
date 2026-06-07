import type { Capability, Category, Check } from "../checks/types.js";
import { securityHeadersCheck } from "../checks/security/security-headers.js";

/**
 * The registry of all available checks. New checks are added here; the
 * orchestrator selects from this list based on each target's enabled categories.
 */
export const ALL_CHECKS: Check[] = [securityHeadersCheck];

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
