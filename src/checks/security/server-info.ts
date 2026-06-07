import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Headers that commonly leak software/version information. */
const LEAKY_HEADERS = ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"];

/** A version-looking token (e.g. "nginx/1.25.3", "PHP/8.2"). */
const VERSION_PATTERN = /\d+\.\d+/;

/**
 * Flags response headers that disclose server software versions, which aid
 * attackers in fingerprinting known-vulnerable stacks.
 */
export const serverInfoCheck: Check = {
  id: "security.server-info",
  category: "security",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const headers = artifacts.mainResponseHeaders;
    const findings: Finding[] = [];
    const disclosed: Record<string, string> = {};

    for (const name of LEAKY_HEADERS) {
      const value = headers[name];
      if (value === undefined) continue;
      disclosed[name] = value;
      const severity = VERSION_PATTERN.test(value) ? "warning" : "info";
      findings.push({
        severity,
        message: `${name} header discloses ${severity === "warning" ? "a version: " : ""}"${value}"`,
        remediation: "Suppress or genericize server/version headers at the edge.",
        detail: { header: name, value },
      });
    }

    const hasWarning = findings.some((f) => f.severity === "warning");
    return makeResult(this, {
      status: hasWarning ? "warn" : "pass",
      observations: { disclosed },
      findings,
    });
  },
};
