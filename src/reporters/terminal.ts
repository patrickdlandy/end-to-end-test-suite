import Table from "cli-table3";
import pc from "picocolors";
import type { CheckStatus } from "../checks/types.js";
import type { AuditReport } from "../budgets/evaluate.js";

function statusBadge(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return pc.green("PASS");
    case "fail":
      return pc.red("FAIL");
    case "warn":
      return pc.yellow("WARN");
    case "skip":
      return pc.dim("SKIP");
    default:
      return pc.cyan("INFO");
  }
}

/** Render the audit report as a human-readable terminal summary. */
export function renderTerminalReport(report: AuditReport): string {
  const lines: string[] = [];

  for (const target of report.targets) {
    lines.push("");
    lines.push(pc.bold(pc.underline(target.url)));
    if (!target.ok) {
      lines.push(pc.red(`  navigation failed: ${target.error ?? "unknown error"}`));
      continue;
    }
    if (target.finalUrl !== target.url) {
      lines.push(pc.dim(`  -> ${target.finalUrl} (HTTP ${target.status})`));
    }

    const table = new Table({
      head: [pc.dim("check"), pc.dim("status"), pc.dim("score"), pc.dim("findings")],
      style: { head: [], border: [] },
    });

    for (const result of target.results) {
      const errors = result.findings.filter((f) => f.severity === "error").length;
      const warnings = result.findings.filter((f) => f.severity === "warning").length;
      const findingSummary =
        result.findings.length === 0
          ? pc.dim("none")
          : [
              errors ? pc.red(`${errors} error`) : "",
              warnings ? pc.yellow(`${warnings} warn`) : "",
            ]
              .filter(Boolean)
              .join(" ");
      table.push([
        result.id,
        statusBadge(result.status),
        result.score === undefined ? "-" : result.score.toFixed(2),
        findingSummary,
      ]);
    }
    lines.push(table.toString());

    for (const result of target.results) {
      for (const f of result.findings) {
        const tag =
          f.severity === "error"
            ? pc.red("✗")
            : f.severity === "warning"
              ? pc.yellow("!")
              : pc.cyan("i");
        lines.push(`  ${tag} [${result.id}] ${f.message}`);
        if (f.remediation) lines.push(pc.dim(`      → ${f.remediation}`));
      }
    }
  }

  const s = report.summary;
  lines.push("");
  const verdict = s.failed ? pc.red(pc.bold("FAILED")) : pc.green(pc.bold("PASSED"));
  lines.push(
    `${verdict}  ${s.targetCount} target(s), ${s.totalChecks} check(s), ` +
      `${s.failedChecks} failed, ${s.errorFindings} error / ${s.warningFindings} warning finding(s)`,
  );

  return lines.join("\n");
}
