import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Checks for a reachable robots.txt at the site root and whether it references a
 * sitemap. Fetched directly (robots.txt is always at the origin root, separate
 * from the page navigation).
 */
export const seoRobotsCheck: Check = {
  id: "seo.robots",
  category: "seo",
  needs: ["artifacts"],
  async run({ target, artifacts }: CheckContext): Promise<CheckResult> {
    const origin = new URL(artifacts.finalUrl || target.url).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const findings: Finding[] = [];

    let status = 0;
    let hasSitemap = false;
    let bytes = 0;
    try {
      const res = await fetch(robotsUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(target.timeoutMs),
      });
      status = res.status;
      if (res.ok) {
        const body = await res.text();
        bytes = body.length;
        hasSitemap = /^\s*sitemap:/im.test(body);
        if (!hasSitemap) {
          findings.push({
            severity: "info",
            message: "robots.txt has no Sitemap: directive",
            remediation: "Reference your sitemap.xml from robots.txt.",
          });
        }
      } else {
        findings.push({
          severity: "warning",
          message: `robots.txt returned HTTP ${status}`,
          remediation: "Serve a robots.txt at the site root.",
        });
      }
    } catch (err) {
      findings.push({
        severity: "warning",
        message: `Could not fetch robots.txt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const hasWarning = findings.some((f) => f.severity === "warning");
    return makeResult(this, {
      status: hasWarning ? "warn" : "pass",
      observations: { robotsUrl, status, hasSitemap, bytes },
      findings,
    });
  },
};
