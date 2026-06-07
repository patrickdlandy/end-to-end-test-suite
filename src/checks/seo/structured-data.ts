import * as cheerio from "cheerio";
import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Collect the schema.org @type values from a parsed JSON-LD node (recursively). */
function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") out.add(type);
    if (Array.isArray(type)) for (const t of type) if (typeof t === "string") out.add(t);
    if (record["@graph"]) collectTypes(record["@graph"], out);
  }
}

/**
 * Detects and validates JSON-LD structured data. Reports the schema.org types
 * found; invalid JSON-LD blocks are warnings, absence is an info finding.
 */
export const seoStructuredDataCheck: Check = {
  id: "seo.structured-data",
  category: "seo",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const $ = cheerio.load(artifacts.html);
    const blocks = $('script[type="application/ld+json"]');
    const findings: Finding[] = [];
    const types = new Set<string>();
    let invalid = 0;

    blocks.each((index, el) => {
      const raw = $(el).contents().text();
      try {
        collectTypes(JSON.parse(raw), types);
      } catch {
        invalid += 1;
        findings.push({
          severity: "warning",
          message: `JSON-LD block #${index + 1} is not valid JSON`,
        });
      }
    });

    if (blocks.length === 0) {
      findings.push({
        severity: "info",
        message: "No JSON-LD structured data found",
        remediation: "Add schema.org JSON-LD to enable rich results.",
      });
    }

    const hasWarning = findings.some((f) => f.severity === "warning");
    return makeResult(this, {
      status: hasWarning ? "warn" : "pass",
      observations: { blockCount: blocks.length, invalid, types: [...types] },
      findings,
    });
  },
};
