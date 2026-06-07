import { describe, it, expect } from "vitest";
import { evaluate, type TargetReport } from "../src/budgets/evaluate.js";
import { renderHtmlReport } from "../src/reporters/html.js";
import { emitGithubAnnotations } from "../src/reporters/github.js";
import type { CheckResult } from "../src/checks/types.js";

function result(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: "security.headers",
    category: "security",
    status: "fail",
    observations: {},
    findings: [{ severity: "error", message: "Missing security header: csp" }],
    ...overrides,
  };
}

function targetReport(results: CheckResult[], ok = true): TargetReport {
  return { url: "https://example.com/", finalUrl: "https://example.com/", status: 200, ok, results, captureDurationMs: 5 };
}

const meta = { startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z" };

describe("renderHtmlReport", () => {
  it("includes the verdict and escapes finding text", () => {
    const report = evaluate(
      [targetReport([result({ findings: [{ severity: "error", message: "bad <script> & stuff" }] })])],
      ["error"],
      meta,
    );
    const html = renderHtmlReport(report);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("FAILED");
    expect(html).toContain("bad &lt;script&gt; &amp; stuff");
    expect(html).not.toContain("bad <script>");
  });
});

describe("emitGithubAnnotations", () => {
  it("emits ::error / ::warning commands and skips info", () => {
    const report = evaluate(
      [
        targetReport([
          result({
            findings: [
              { severity: "error", message: "an error" },
              { severity: "warning", message: "a warning" },
              { severity: "info", message: "just info" },
            ],
          }),
        ]),
      ],
      ["error"],
      meta,
    );
    const lines: string[] = [];
    emitGithubAnnotations(report, (l) => lines.push(l));
    expect(lines.some((l) => l.startsWith("::error::") && l.includes("an error"))).toBe(true);
    expect(lines.some((l) => l.startsWith("::warning::") && l.includes("a warning"))).toBe(true);
    expect(lines.some((l) => l.includes("just info"))).toBe(false);
  });

  it("escapes newlines in annotation messages", () => {
    const report = evaluate(
      [targetReport([result({ findings: [{ severity: "error", message: "line1\nline2" }] })])],
      ["error"],
      meta,
    );
    const lines: string[] = [];
    emitGithubAnnotations(report, (l) => lines.push(l));
    expect(lines[0]).toContain("%0A");
    expect(lines[0]).not.toContain("\n");
  });
});
