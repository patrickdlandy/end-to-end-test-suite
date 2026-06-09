import { join } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig } from "../config/load.js";
import { runAudit } from "../core/orchestrator.js";
import { writeJsonReport } from "../reporters/json.js";
import { renderTerminalReport } from "../reporters/terminal.js";
import { writeHtmlReport } from "../reporters/html.js";
import { writeJunitReport } from "../reporters/junit.js";
import { emitGithubAnnotations } from "../reporters/github.js";

/** Known reporter names. */
const KNOWN_REPORTERS = new Set(["json", "terminal", "html", "junit", "github"]);

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("audit")
    .description("Comprehensive black-box end-to-end audit suite for websites")
    .version("0.1.0");

  program
    .command("run")
    .description("Run the audit against the targets in a config file")
    .requiredOption("-c, --config <path>", "path to the audit config (YAML or JSON)")
    .option("-d, --out-dir <dir>", "directory for report files", "reports")
    .option("--concurrency <n>", "max concurrent target navigations", (v) => parseInt(v, 10))
    .option(
      "--reporters <list>",
      "comma-separated reporters (json,terminal,html,junit,github); overrides config",
    )
    .action(async (opts) => {
      const { config, targets } = loadConfig(opts.config);
      const reporters: string[] = opts.reporters
        ? String(opts.reporters)
            .split(",")
            .map((r) => r.trim())
        : config.ci.reporters;

      for (const r of reporters) {
        if (!KNOWN_REPORTERS.has(r)) {
          console.error(pc.yellow(`Unknown reporter "${r}" ignored.`));
        }
      }

      const report = await runAudit(targets, {
        concurrency: opts.concurrency,
        failOn: config.ci.failOn,
        politeness: config.politeness,
      });

      const outDir: string = opts.outDir;
      if (reporters.includes("json")) {
        const path = writeJsonReport(report, join(outDir, "audit.json"));
        console.log(pc.dim(`JSON report written to ${path}`));
      }
      if (reporters.includes("html")) {
        const path = writeHtmlReport(report, join(outDir, "audit.html"));
        console.log(pc.dim(`HTML report written to ${path}`));
      }
      if (reporters.includes("junit")) {
        const path = writeJunitReport(report, join(outDir, "junit.xml"));
        console.log(pc.dim(`JUnit report written to ${path}`));
      }
      if (reporters.includes("github")) {
        emitGithubAnnotations(report);
      }
      if (reporters.includes("terminal")) {
        console.log(renderTerminalReport(report));
      }

      process.exitCode = report.summary.failed ? 1 : 0;
    });

  return program;
}

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    console.error(pc.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 2;
  }
}
