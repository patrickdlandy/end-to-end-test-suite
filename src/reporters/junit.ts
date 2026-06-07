import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import junitDefault from "junit-report-builder";
import type { Builder } from "junit-report-builder";
import type { AuditReport } from "../budgets/evaluate.js";

// The default export is the singleton builder (CJS interop mistypes it as the namespace).
const junitBuilder = junitDefault as unknown as Builder;

/**
 * JUnit XML reporter. One <testsuite> per target, one <testcase> per check
 * (classname = category, name = check id). Failing checks become <failure>,
 * skipped checks <skipped>; a navigation error becomes an <error> testcase.
 * Consumable by GitHub test-reporter actions for inline PR annotations.
 */
export function writeJunitReport(report: AuditReport, outPath: string): string {
  const builder = junitBuilder.newBuilder();

  for (const target of report.targets) {
    const suite = builder.testSuite().name(target.url);

    if (!target.ok) {
      suite
        .testCase()
        .className("navigation")
        .name("navigate")
        .error(target.error ?? "navigation failed");
      continue;
    }

    for (const result of target.results) {
      const tc = suite.testCase().className(result.category).name(result.id);
      const errors = result.findings.filter((f) => f.severity === "error");

      if (result.status === "fail" || errors.length > 0) {
        tc.failure(errors.map((f) => f.message).join("\n") || "check failed");
      } else if (result.status === "skip") {
        tc.skipped();
      }

      if (result.findings.length > 0) {
        tc.standardOutput(result.findings.map((f) => `[${f.severity}] ${f.message}`).join("\n"));
      }
    }
  }

  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, builder.build(), "utf8");
  return absolute;
}
