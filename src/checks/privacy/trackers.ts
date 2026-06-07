import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";
import { classifyHost, trackerDbAvailable } from "../../core/trackers-db.js";

/**
 * Classifies third-party requests against the vendored Disconnect blocklist and
 * fails when the count of distinct tracker hosts exceeds `maxThirdPartyTrackers`.
 */
export const trackersCheck: Check = {
  id: "privacy.trackers",
  category: "privacy",
  needs: ["artifacts"],
  run({ target, artifacts }: CheckContext): CheckResult {
    if (!trackerDbAvailable()) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "Tracker blocklist unavailable; skipping." }],
      });
    }

    // Distinct third-party hosts → category (null if not a known tracker).
    const byHost = new Map<string, string>();
    for (const req of artifacts.requests) {
      if (!req.thirdParty || req.host === "" || byHost.has(req.host)) continue;
      const category = classifyHost(req.host);
      if (category) byHost.set(req.host, category);
    }

    const byCategory: Record<string, number> = {};
    for (const category of byHost.values()) {
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    const trackerCount = byHost.size;
    const max = target.budgets.privacy?.maxThirdPartyTrackers ?? Infinity;
    const findings: Finding[] = [];

    if (trackerCount > 0) {
      const summary = Object.entries(byCategory)
        .map(([cat, n]) => `${cat}: ${n}`)
        .join(", ");
      findings.push({
        severity: trackerCount > max ? "error" : "warning",
        message: `${trackerCount} third-party tracker host(s) detected (${summary})`,
        remediation: "Remove or defer non-essential third-party trackers; load behind consent.",
        detail: { hosts: [...byHost.keys()], byCategory },
      });
    }

    return makeResult(this, {
      status: trackerCount > max ? "fail" : trackerCount > 0 ? "warn" : "pass",
      observations: { trackerCount, byCategory, hosts: [...byHost.entries()] },
      findings,
    });
  },
};
