import type { Capability, Category, Check } from "../checks/types.js";
import { securityHeadersCheck } from "../checks/security/security-headers.js";
import { tlsCheck } from "../checks/security/tls.js";
import { cookiesCheck } from "../checks/security/cookies.js";
import { mixedContentCheck } from "../checks/security/mixed-content.js";
import { corsCheck } from "../checks/security/cors.js";
import { serverInfoCheck } from "../checks/security/server-info.js";
import { vulnLibsCheck } from "../checks/security/vuln-libs.js";
import { lighthousePerfCheck } from "../checks/performance/lighthouse-perf.js";
import { axeCheck } from "../checks/accessibility/axe.js";
import { seoMetaCheck } from "../checks/seo/meta.js";
import { seoIndexabilityCheck } from "../checks/seo/indexability.js";
import { seoRobotsCheck } from "../checks/seo/robots.js";
import { seoStructuredDataCheck } from "../checks/seo/structured-data.js";
import { consoleErrorsCheck } from "../checks/best-practices/console.js";
import { httpsCheck } from "../checks/best-practices/https.js";
import { trackersCheck } from "../checks/privacy/trackers.js";
import { thirdPartyCookiesCheck } from "../checks/privacy/third-party-cookies.js";
import { fingerprintingCheck } from "../checks/privacy/fingerprinting.js";
import { consentCheck } from "../checks/privacy/consent.js";
import type { LhCategory } from "./lighthouse-runner.js";

/**
 * The registry of all available checks. New checks are added here; the
 * orchestrator selects from this list based on each target's enabled categories.
 */
export const ALL_CHECKS: Check[] = [
  // security
  securityHeadersCheck,
  tlsCheck,
  cookiesCheck,
  mixedContentCheck,
  corsCheck,
  serverInfoCheck,
  vulnLibsCheck,
  // performance
  lighthousePerfCheck,
  // accessibility
  axeCheck,
  // seo
  seoMetaCheck,
  seoIndexabilityCheck,
  seoRobotsCheck,
  seoStructuredDataCheck,
  // best practices
  consoleErrorsCheck,
  httpsCheck,
  // privacy
  trackersCheck,
  thirdPartyCookiesCheck,
  fingerprintingCheck,
  consentCheck,
];

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
