import { appendFileSync } from "node:fs";
import type { AuditReport, TargetReport } from "../budgets/evaluate.js";

/** Escape a string for use in a GitHub Actions workflow command. */
function escapeData(message: string): string {
  return message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function workflowCommand(level: "error" | "warning" | "notice", message: string): string {
  return `::${level}::${escapeData(message)}`;
}

/** Markdown summary table for the GitHub job summary panel. */
function renderMarkdownSummary(report: AuditReport): string {
  const s = report.summary;
  const lines: string[] = [];
  lines.push("## Web audit results", "");
  lines.push(s.failed ? "**Result: ❌ FAILED**" : "**Result: ✅ PASSED**", "");
  lines.push(
    `${s.targetCount} target(s) · ${s.totalChecks} check(s) · ${s.failedChecks} failed · ` +
      `${s.errorFindings} error / ${s.warningFindings} warning finding(s)`,
    "",
  );

  for (const target of report.targets) {
    lines.push(`### ${target.url}`, "");
    if (!target.ok) {
      lines.push(`> ⚠️ navigation failed: ${target.error ?? "unknown error"}`, "");
      continue;
    }
    lines.push("| Check | Status | Findings |", "| --- | --- | --- |");
    for (const r of target.results) {
      const errors = r.findings.filter((f) => f.severity === "error").length;
      const warnings = r.findings.filter((f) => f.severity === "warning").length;
      const findings = errors || warnings ? `${errors} error, ${warnings} warning` : "—";
      lines.push(`| ${r.id} | ${r.status.toUpperCase()} | ${findings} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function annotateTarget(target: TargetReport, emit: (line: string) => void): void {
  if (!target.ok) {
    emit(workflowCommand("error", `[${target.url}] navigation failed: ${target.error ?? "unknown"}`));
    return;
  }
  for (const result of target.results) {
    for (const finding of result.findings) {
      if (finding.severity === "info") continue;
      const level = finding.severity === "error" ? "error" : "warning";
      emit(workflowCommand(level, `[${target.url}] ${result.id}: ${finding.message}`));
    }
  }
}

/**
 * GitHub reporter: emits ::error/::warning workflow commands (shown inline in
 * the Actions log) and appends a markdown summary to the job summary panel when
 * running under Actions (GITHUB_STEP_SUMMARY).
 */
export function emitGithubAnnotations(
  report: AuditReport,
  log: (line: string) => void = console.log,
): void {
  for (const target of report.targets) {
    annotateTarget(target, log);
  }

  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) {
    appendFileSync(summaryPath, renderMarkdownSummary(report) + "\n", "utf8");
  }
}
