import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scanUri, replaceVersion } from "retire";
import type { Repository, Component } from "retire/lib/types.js";
import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Vendored snapshot of the retire.js vulnerability repository. Vendored (rather
 * than fetched at runtime) for reproducible results; refresh on a schedule.
 */
const REPO_PATH = fileURLToPath(new URL("../../data/retire-jsrepository.json", import.meta.url));

let cachedRepo: Repository | null | undefined;

/** Load + cache the vulnerability DB. Returns null if it can't be read. */
function loadRepo(): Repository | null {
  if (cachedRepo !== undefined) return cachedRepo;
  try {
    const text = readFileSync(REPO_PATH, "utf8");
    cachedRepo = JSON.parse(replaceVersion(text)) as Repository;
  } catch {
    cachedRepo = null;
  }
  return cachedRepo;
}

function highestSeverity(component: Component): string {
  const order = ["none", "low", "medium", "high", "critical"];
  let worst = "none";
  for (const v of component.vulnerabilities ?? []) {
    if (order.indexOf(v.severity) > order.indexOf(worst)) worst = v.severity;
  }
  return worst;
}

function identifiers(component: Component): string[] {
  const ids = new Set<string>();
  for (const v of component.vulnerabilities ?? []) {
    for (const cve of v.identifiers.CVE ?? []) ids.add(cve);
    if (v.identifiers.githubID) ids.add(v.identifiers.githubID);
  }
  return [...ids];
}

/**
 * Detects known-vulnerable client-side JS libraries by matching loaded script
 * URLs against the retire.js repository. Fails when the count of vulnerable
 * libraries exceeds the `maxVulnLibs` budget.
 */
export const vulnLibsCheck: Check = {
  id: "security.vuln-libs",
  category: "security",
  needs: ["artifacts"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const repo = loadRepo();
    if (!repo) {
      return makeResult(this, {
        status: "skip",
        findings: [
          {
            severity: "info",
            message: "Vulnerability database unavailable; skipping vuln-libs scan.",
          },
        ],
      });
    }

    const scriptUrls = [
      ...new Set(
        artifacts.requests
          .filter((r) => r.resourceType === "script" || r.url.endsWith(".js"))
          .map((r) => r.url),
      ),
    ];

    const vulnerable: Component[] = [];
    for (const url of scriptUrls) {
      for (const component of scanUri(url, repo)) {
        if (component.vulnerabilities && component.vulnerabilities.length > 0) {
          vulnerable.push(component);
        }
      }
    }

    const findings: Finding[] = vulnerable.map((c) => ({
      severity: "error",
      message: `Vulnerable library: ${c.component}@${c.version} (${highestSeverity(c)})`,
      remediation: `Upgrade ${c.component} to a fixed version.`,
      detail: { component: c.component, version: c.version, identifiers: identifiers(c) },
    }));

    const maxVuln = target.budgets.security?.maxVulnLibs ?? 0;
    const failed = vulnerable.length > maxVuln;

    return makeResult(this, {
      status: vulnerable.length === 0 ? "pass" : failed ? "fail" : "warn",
      observations: {
        scriptsScanned: scriptUrls.length,
        vulnerableCount: vulnerable.length,
        budget: maxVuln,
      },
      findings,
    });
  },
};
