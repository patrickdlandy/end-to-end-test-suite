import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Parse a TLS protocol string like "TLSv1.2" into a comparable number (1.2). */
function protocolVersion(protocol: string | undefined): number | undefined {
  if (!protocol) return undefined;
  const match = /TLSv([0-9.]+)/.exec(protocol);
  return match ? Number(match[1]) : undefined;
}

/**
 * Validates the target's TLS: certificate trust, days-to-expiry against budget,
 * and negotiated protocol against the minimum allowed version.
 */
export const tlsCheck: Check = {
  id: "security.tls",
  category: "security",
  needs: ["tls"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const tls = artifacts.tls;
    const budget = target.budgets.security ?? {};
    const findings: Finding[] = [];

    if (!tls) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "No TLS info captured" }],
      });
    }

    if (tls.error) {
      return makeResult(this, {
        status: "fail",
        observations: { tls },
        findings: [{ severity: "error", message: `TLS connection failed: ${tls.error}` }],
      });
    }

    if (!tls.authorized) {
      findings.push({
        severity: "error",
        message: `Certificate not trusted: ${tls.authorizationError ?? "unknown reason"}`,
        remediation: "Install a certificate chain that validates to a trusted root CA.",
      });
    }

    const minDays = budget.certMinDaysToExpiry;
    if (minDays !== undefined && tls.daysToExpiry !== undefined && tls.daysToExpiry < minDays) {
      findings.push({
        severity: tls.daysToExpiry < 0 ? "error" : "warning",
        message:
          tls.daysToExpiry < 0
            ? `Certificate expired ${-tls.daysToExpiry} day(s) ago`
            : `Certificate expires in ${tls.daysToExpiry} day(s), below budget of ${minDays}`,
        remediation: "Renew the TLS certificate before it expires.",
        detail: { daysToExpiry: tls.daysToExpiry, budget: minDays },
      });
    }

    const minVersion = protocolVersion(`TLSv${budget.minTlsVersion ?? ""}`);
    const negotiated = protocolVersion(tls.protocol);
    if (minVersion !== undefined && negotiated !== undefined && negotiated < minVersion) {
      findings.push({
        severity: "error",
        message: `Negotiated ${tls.protocol} is below minimum TLS ${budget.minTlsVersion}`,
        remediation: "Disable legacy TLS protocol versions on the server.",
        detail: { negotiated: tls.protocol, min: budget.minTlsVersion },
      });
    }

    const hasError = findings.some((f) => f.severity === "error");
    return makeResult(this, {
      status: findings.length === 0 ? "pass" : hasError ? "fail" : "warn",
      observations: { tls },
      findings,
    });
  },
};
