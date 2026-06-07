import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Flags cookies missing recommended security attributes. On HTTPS pages every
 * cookie should be Secure + HttpOnly with an explicit SameSite; SameSite=None
 * additionally requires Secure.
 */
export const cookiesCheck: Check = {
  id: "security.cookies",
  category: "security",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const findings: Finding[] = [];
    const onHttps = artifacts.isHttps;

    for (const cookie of artifacts.cookies) {
      const issues: string[] = [];
      if (onHttps && !cookie.secure) issues.push("missing Secure");
      if (!cookie.httpOnly) issues.push("missing HttpOnly");
      if (cookie.sameSite === undefined) issues.push("no SameSite");
      if (cookie.sameSite === "None" && !cookie.secure) issues.push("SameSite=None without Secure");

      if (issues.length > 0) {
        findings.push({
          severity: "warning",
          message: `Cookie "${cookie.name}" (${cookie.domain}): ${issues.join(", ")}`,
          remediation: "Set Secure, HttpOnly, and an explicit SameSite attribute.",
          detail: {
            name: cookie.name,
            domain: cookie.domain,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
          },
        });
      }
    }

    return makeResult(this, {
      status: findings.length === 0 ? "pass" : "warn",
      observations: { cookieCount: artifacts.cookies.length, flagged: findings.length },
      findings,
    });
  },
};
