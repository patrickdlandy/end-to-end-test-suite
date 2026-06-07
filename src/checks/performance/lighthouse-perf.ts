import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Format a metric for display: millisecond metrics read best as integers, but
 * unitless metrics like CLS are fractional and must keep their decimals
 * (Math.round would render 0.265 as "0").
 */
function formatValue(value: number, unit: string): string {
  return unit === "ms" ? String(Math.round(value)) : String(Number(value.toFixed(3)));
}

/** Compare an observed value against a max budget, producing an error finding if exceeded. */
function checkMax(
  label: string,
  observed: number | undefined,
  max: number | undefined,
  unit: string,
): Finding | undefined {
  if (observed === undefined || max === undefined) return undefined;
  if (observed <= max) return undefined;
  return {
    severity: "error",
    message: `${label} ${formatValue(observed, unit)}${unit} exceeds budget ${max}${unit}`,
    detail: { observed, budget: max },
  };
}

/**
 * Evaluates Lighthouse performance results against the target's performance
 * budget (score floor + Core Web Vitals ceilings). Reads the median-aggregated
 * Lighthouse result captured by the orchestrator.
 *
 * Note: INP is a field metric not produced by a cold lab navigation; TBT is the
 * lab proxy and is gated via `tbtMs`. An `inpMs` budget is reported as info only.
 */
export const lighthousePerfCheck: Check = {
  id: "performance.lighthouse",
  category: "performance",
  needs: ["lighthouse"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const lh = artifacts.lighthouse;
    const budget = target.budgets.performance ?? {};

    if (!lh) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "No Lighthouse result captured" }],
      });
    }

    const score = lh.categoryScores.performance;
    const m = lh.metrics;
    const findings: Finding[] = [];

    if (budget.score !== undefined && score !== undefined && score < budget.score) {
      findings.push({
        severity: "error",
        message: `Performance score ${score.toFixed(2)} below budget ${budget.score.toFixed(2)}`,
        detail: { observed: score, budget: budget.score },
      });
    }

    const ceilingFindings = [
      checkMax("LCP", m.lcpMs, budget.lcpMs, "ms"),
      checkMax("CLS", m.cls, budget.cls, ""),
      checkMax("TBT", m.tbtMs, budget.tbtMs, "ms"),
    ].filter((f): f is Finding => f !== undefined);
    findings.push(...ceilingFindings);

    if (budget.inpMs !== undefined) {
      findings.push({
        severity: "info",
        message:
          "INP is a field metric and is not measured in a lab navigation; " +
          "TBT (tbtMs budget) is used as the lab proxy.",
      });
    }

    const hasError = findings.some((f) => f.severity === "error");
    return makeResult(this, {
      status: hasError ? "fail" : "pass",
      score,
      observations: {
        runs: lh.runs,
        score,
        metrics: m,
        budget,
      },
      findings,
    });
  },
};
