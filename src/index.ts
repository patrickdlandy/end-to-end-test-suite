/** Public library entry — re-exports the pieces used programmatically. */
export { loadConfig, parseConfig, resolveTargets, deepMerge } from "./config/load.js";
export { runAudit } from "./core/orchestrator.js";
export { evaluate } from "./budgets/evaluate.js";
export type { AuditReport, TargetReport } from "./budgets/evaluate.js";
export { writeJsonReport } from "./reporters/json.js";
export { renderTerminalReport } from "./reporters/terminal.js";
export { renderHtmlReport, writeHtmlReport } from "./reporters/html.js";
export { writeJunitReport } from "./reporters/junit.js";
export { emitGithubAnnotations } from "./reporters/github.js";
export type { Check, CheckResult, CheckContext, Finding, Category } from "./checks/types.js";
export type { PageArtifacts } from "./core/artifacts.js";
export type { AuditConfig, ResolvedTarget } from "./config/schema.js";
