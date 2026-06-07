import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Detects mixed content: insecure http:// subresource requests issued from a
 * page served over https://.
 */
export const mixedContentCheck: Check = {
  id: "security.mixed-content",
  category: "security",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    if (!artifacts.isHttps) {
      return makeResult(this, {
        status: "info",
        findings: [{ severity: "info", message: "Page is not HTTPS; mixed content is not applicable" }],
      });
    }

    const insecure = artifacts.requests.filter((r) => r.url.startsWith("http://"));
    const uniqueUrls = [...new Set(insecure.map((r) => r.url))];

    const findings: Finding[] = uniqueUrls.slice(0, 20).map((url) => ({
      severity: "error",
      message: `Insecure resource loaded over http://: ${url}`,
      remediation: "Serve all subresources over HTTPS.",
    }));
    if (uniqueUrls.length > 20) {
      findings.push({
        severity: "info",
        message: `…and ${uniqueUrls.length - 20} more insecure resource(s)`,
      });
    }

    return makeResult(this, {
      status: uniqueUrls.length === 0 ? "pass" : "fail",
      observations: { insecureRequestCount: insecure.length, uniqueInsecureUrls: uniqueUrls },
      findings,
    });
  },
};
