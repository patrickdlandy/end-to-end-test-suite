import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Confirms the page is served over HTTPS and that an http:// request was
 * upgraded/redirected to https:// rather than staying insecure.
 */
export const httpsCheck: Check = {
  id: "best-practices.https",
  category: "best-practices",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const findings: Finding[] = [];

    if (!artifacts.isHttps) {
      findings.push({
        severity: "error",
        message: "Page is not served over HTTPS",
        remediation: "Serve all traffic over HTTPS and redirect http:// to https://.",
      });
    } else if (artifacts.requestedUrl.startsWith("http://")) {
      findings.push({
        severity: "info",
        message: "Requested over http:// and upgraded to https://",
      });
    }

    return makeResult(this, {
      status: artifacts.isHttps ? "pass" : "fail",
      observations: {
        isHttps: artifacts.isHttps,
        requestedUrl: artifacts.requestedUrl,
        finalUrl: artifacts.finalUrl,
      },
      findings,
    });
  },
};
