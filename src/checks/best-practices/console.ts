import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Flags browser console errors (and warnings) emitted during page load — a
 * signal of broken scripts, failed requests, or deprecated API usage.
 */
export const consoleErrorsCheck: Check = {
  id: "best-practices.console",
  category: "best-practices",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const errors = artifacts.console.filter((m) => m.type === "error");
    const warnings = artifacts.console.filter((m) => m.type === "warning");

    const findings: Finding[] = errors.slice(0, 15).map((m) => ({
      severity: "warning",
      message: `Console error: ${m.text.slice(0, 200)}`,
      detail: { location: m.location },
    }));
    if (errors.length > 15) {
      findings.push({ severity: "info", message: `…and ${errors.length - 15} more console error(s)` });
    }

    return makeResult(this, {
      status: errors.length === 0 ? "pass" : "warn",
      observations: { errorCount: errors.length, warningCount: warnings.length },
      findings,
    });
  },
};
