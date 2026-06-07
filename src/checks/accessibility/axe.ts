import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Evaluates axe-core accessibility violations (captured during navigation)
 * against the target's budget. Critical/serious violations are errors and gate
 * via `maxCritical`/`maxSerious`; moderate/minor are reported as warnings.
 */
export const axeCheck: Check = {
  id: "accessibility.axe",
  category: "accessibility",
  needs: ["axe"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const axe = artifacts.axe;
    if (!axe) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "No axe results captured" }],
      });
    }

    const budget = target.budgets.accessibility ?? {};
    const findings: Finding[] = axe.violations.map((v) => {
      const isSerious = v.impact === "critical" || v.impact === "serious";
      return {
        severity: isSerious ? "error" : "warning",
        message: `[${v.impact}] ${v.help} (${v.nodeCount} node${v.nodeCount === 1 ? "" : "s"})`,
        remediation: v.sampleTargets.length ? `e.g. ${v.sampleTargets.join(", ")}` : undefined,
        helpUrl: v.helpUrl,
        detail: { rule: v.id, impact: v.impact, nodeCount: v.nodeCount },
      };
    });

    const maxCritical = budget.maxCritical ?? 0;
    const maxSerious = budget.maxSerious ?? 0;
    const overCritical = axe.counts.critical > maxCritical;
    const overSerious = axe.counts.serious > maxSerious;

    if (overCritical) {
      findings.push({
        severity: "error",
        message: `${axe.counts.critical} critical violation(s) exceed budget of ${maxCritical}`,
      });
    }
    if (overSerious) {
      findings.push({
        severity: "error",
        message: `${axe.counts.serious} serious violation(s) exceed budget of ${maxSerious}`,
      });
    }

    return makeResult(this, {
      status: overCritical || overSerious ? "fail" : axe.violations.length === 0 ? "pass" : "warn",
      observations: {
        counts: axe.counts,
        violationRules: axe.violations.map((v) => v.id),
        passes: axe.passes,
        incomplete: axe.incomplete,
      },
      findings,
    });
  },
};
