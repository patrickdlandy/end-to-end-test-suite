import { describe, it, expect } from "vitest";
import { evaluate, type TargetReport } from "../src/budgets/evaluate.js";
import type { CheckResult } from "../src/checks/types.js";

function result(status: CheckResult["status"], errors = 0, warnings = 0): CheckResult {
  return {
    id: "security.headers",
    category: "security",
    status,
    observations: {},
    findings: [
      ...Array.from({ length: errors }, () => ({ severity: "error" as const, message: "e" })),
      ...Array.from({ length: warnings }, () => ({ severity: "warning" as const, message: "w" })),
    ],
  };
}

function targetReport(results: CheckResult[], ok = true): TargetReport {
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    status: 200,
    ok,
    results,
    captureDurationMs: 1,
  };
}

const meta = { startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z" };

describe("evaluate", () => {
  it("fails when an error finding exists and failOn includes error", () => {
    const report = evaluate([targetReport([result("fail", 1)])], ["error"], meta);
    expect(report.summary.failed).toBe(true);
    expect(report.summary.errorFindings).toBe(1);
    expect(report.summary.failedChecks).toBe(1);
  });

  it("passes when only warnings exist and failOn is error-only", () => {
    const report = evaluate([targetReport([result("warn", 0, 2)])], ["error"], meta);
    expect(report.summary.failed).toBe(false);
    expect(report.summary.warningFindings).toBe(2);
  });

  it("fails when failOn includes warning and a warning exists", () => {
    const report = evaluate([targetReport([result("warn", 0, 1)])], ["error", "warning"], meta);
    expect(report.summary.failed).toBe(true);
  });

  it("fails when a target could not be navigated", () => {
    const report = evaluate([targetReport([], false)], ["error"], meta);
    expect(report.summary.failed).toBe(true);
  });
});
