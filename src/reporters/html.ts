import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AuditReport, TargetReport } from "../budgets/evaluate.js";
import type { CheckResult, CheckStatus, Finding } from "../checks/types.js";

/** Escape text for safe interpolation into HTML. */
function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusClass(status: CheckStatus): string {
  return `status-${status}`;
}

function renderFinding(finding: Finding): string {
  const parts = [`<span class="sev sev-${finding.severity}">${finding.severity}</span> ${esc(finding.message)}`];
  if (finding.remediation) parts.push(`<div class="rem">→ ${esc(finding.remediation)}</div>`);
  if (finding.helpUrl) parts.push(`<div class="help"><a href="${esc(finding.helpUrl)}">${esc(finding.helpUrl)}</a></div>`);
  return `<li>${parts.join("")}</li>`;
}

function renderCheck(result: CheckResult): string {
  const score = result.score === undefined ? "" : `<span class="score">${result.score.toFixed(2)}</span>`;
  const findings = result.findings.length
    ? `<ul class="findings">${result.findings.map(renderFinding).join("")}</ul>`
    : "";
  return `<div class="check ${statusClass(result.status)}">
      <div class="check-head">
        <span class="badge ${statusClass(result.status)}">${result.status.toUpperCase()}</span>
        <span class="check-id">${esc(result.id)}</span>${score}
      </div>${findings}
    </div>`;
}

function renderTarget(target: TargetReport): string {
  if (!target.ok) {
    return `<section class="target">
      <h2>${esc(target.url)}</h2>
      <p class="nav-error">Navigation failed: ${esc(target.error ?? "unknown error")}</p>
    </section>`;
  }

  const byCategory = new Map<string, CheckResult[]>();
  for (const result of target.results) {
    const list = byCategory.get(result.category) ?? [];
    list.push(result);
    byCategory.set(result.category, list);
  }

  const categories = [...byCategory.entries()]
    .map(
      ([category, results]) =>
        `<div class="category"><h3>${esc(category)}</h3>${results.map(renderCheck).join("")}</div>`,
    )
    .join("");

  return `<section class="target">
    <h2>${esc(target.url)}</h2>
    <p class="meta">final: ${esc(target.finalUrl)} · HTTP ${esc(target.status)} · ${esc(target.captureDurationMs)}ms</p>
    <div class="categories">${categories}</div>
  </section>`;
}

const STYLES = `
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; max-width: 1100px; margin-inline: auto; }
  h1 { margin: 0 0 .25rem; }
  .summary { padding: 1rem; border-radius: 8px; margin: 1rem 0 2rem; background: #f4f4f5; }
  .summary.failed { background: #fde8e8; }
  .summary.passed { background: #e7f6ec; }
  .verdict { font-weight: 700; font-size: 1.1rem; }
  .target { border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
  .target h2 { margin: 0; word-break: break-all; }
  .meta { color: #666; font-size: .85rem; margin: .25rem 0 1rem; }
  .nav-error { color: #b91c1c; }
  .categories { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .category h3 { text-transform: capitalize; margin: .25rem 0; border-bottom: 1px solid #eee; padding-bottom: .25rem; }
  .check { padding: .5rem 0; border-bottom: 1px dashed #eee; }
  .check-head { display: flex; align-items: center; gap: .5rem; }
  .check-id { font-family: ui-monospace, monospace; }
  .score { margin-left: auto; color: #555; }
  .badge { font-size: .7rem; font-weight: 700; padding: .1rem .4rem; border-radius: 4px; color: #fff; }
  .badge.status-pass { background: #16a34a; }
  .badge.status-fail { background: #dc2626; }
  .badge.status-warn { background: #d97706; }
  .badge.status-skip { background: #6b7280; }
  .badge.status-info { background: #2563eb; }
  .findings { margin: .4rem 0 0; padding-left: 1.1rem; }
  .findings li { margin: .2rem 0; }
  .sev { font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .sev-error { color: #dc2626; } .sev-warning { color: #d97706; } .sev-info { color: #2563eb; }
  .rem, .help { color: #666; font-size: .85rem; margin-left: 1rem; }
`;

/** Render a self-contained HTML report (inlined CSS, no external assets). */
export function renderHtmlReport(report: AuditReport): string {
  const s = report.summary;
  const verdictClass = s.failed ? "failed" : "passed";
  const verdict = s.failed ? "❌ FAILED" : "✅ PASSED";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Web Audit Report</title>
  <style>${STYLES}</style>
</head>
<body>
  <h1>Web Audit Report</h1>
  <p class="meta">${esc(report.startedAt)} → ${esc(report.finishedAt)}</p>
  <div class="summary ${verdictClass}">
    <div class="verdict">${verdict}</div>
    <div>${esc(s.targetCount)} target(s) · ${esc(s.totalChecks)} check(s) · ${esc(s.failedChecks)} failed ·
      ${esc(s.errorFindings)} error / ${esc(s.warningFindings)} warning finding(s)</div>
  </div>
  ${report.targets.map(renderTarget).join("")}
</body>
</html>`;
}

/** Write the HTML report to disk. */
export function writeHtmlReport(report: AuditReport, outPath: string): string {
  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, renderHtmlReport(report), "utf8");
  return absolute;
}
