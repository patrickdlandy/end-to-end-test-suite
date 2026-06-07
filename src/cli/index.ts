import { Command } from "commander";
import pc from "picocolors";
import { loadConfig } from "../config/load.js";
import { runAudit } from "../core/orchestrator.js";
import { writeJsonReport } from "../reporters/json.js";
import { renderTerminalReport } from "../reporters/terminal.js";

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
    .option("-o, --out <path>", "path for the JSON report", "reports/audit.json")
    .option("--concurrency <n>", "max concurrent target navigations", (v) => parseInt(v, 10))
    .option(
      "--reporters <list>",
      "comma-separated reporters (json,terminal); overrides config",
    )
    .action(async (opts) => {
      const { config, targets } = loadConfig(opts.config);
      const reporters = opts.reporters
        ? String(opts.reporters).split(",").map((r) => r.trim())
        : config.ci.reporters;

      const report = await runAudit(targets, {
        concurrency: opts.concurrency,
        failOn: config.ci.failOn,
      });

      if (reporters.includes("json")) {
        const path = writeJsonReport(report, opts.out);
        console.log(pc.dim(`JSON report written to ${path}`));
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
