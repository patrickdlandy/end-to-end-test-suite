import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Remediation hints for the headers we gate on. */
const HEADER_GUIDANCE: Record<string, { remediation: string; helpUrl: string }> = {
  "content-security-policy": {
    remediation:
      "Add a Content-Security-Policy header restricting sources (avoid 'unsafe-inline'/wildcards).",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
  },
  "strict-transport-security": {
    remediation:
      "Add Strict-Transport-Security with max-age >= 15768000 and includeSubDomains.",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security",
  },
  "x-content-type-options": {
    remediation: "Add 'X-Content-Type-Options: nosniff'.",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options",
  },
  "x-frame-options": {
    remediation: "Add 'X-Frame-Options: DENY' or a CSP frame-ancestors directive.",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options",
  },
  "referrer-policy": {
    remediation: "Add a Referrer-Policy such as 'strict-origin-when-cross-origin'.",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy",
  },
  "permissions-policy": {
    remediation: "Add a Permissions-Policy to restrict powerful features.",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy",
  },
};

function guidanceFor(header: string): Partial<Finding> {
  const g = HEADER_GUIDANCE[header];
  return g ? { remediation: g.remediation, helpUrl: g.helpUrl } : {};
}

/**
 * Checks that the response carries the security headers required by the target's
 * budget. Missing required headers are errors; the result fails if any are missing.
 */
export const securityHeadersCheck: Check = {
  id: "security.headers",
  category: "security",
  needs: ["artifacts"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const required = target.budgets.security?.requiredHeaders ?? [];
    const present: string[] = [];
    const missing: string[] = [];

    for (const header of required) {
      if (artifacts.mainResponseHeaders[header] !== undefined) {
        present.push(header);
      } else {
        missing.push(header);
      }
    }

    const findings: Finding[] = missing.map((header) => ({
      severity: "error",
      message: `Missing security header: ${header}`,
      ...guidanceFor(header),
    }));

    const total = required.length;
    const score = total === 0 ? 1 : present.length / total;

    return makeResult(this, {
      status: missing.length === 0 ? "pass" : "fail",
      score,
      observations: {
        required,
        present,
        missing,
        allSecurityHeaders: Object.fromEntries(
          Object.entries(artifacts.mainResponseHeaders).filter(([name]) =>
            name in HEADER_GUIDANCE,
          ),
        ),
      },
      findings,
    });
  },
};
