import * as cheerio from "cheerio";
import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** True if a robots directive string requests non-indexing. */
function blocksIndexing(value: string): boolean {
  const v = value.toLowerCase();
  return v.includes("noindex") || v.includes("none");
}

/**
 * Reports whether the page is indexable: inspects the meta robots tag and the
 * X-Robots-Tag response header for noindex/none directives. A blocked page is an
 * info finding (it is often intentional) rather than a failure.
 */
export const seoIndexabilityCheck: Check = {
  id: "seo.indexability",
  category: "seo",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const $ = cheerio.load(artifacts.html);
    const metaRobots = $('meta[name="robots"]').attr("content")?.trim() ?? "";
    const headerRobots = artifacts.mainResponseHeaders["x-robots-tag"] ?? "";

    const findings: Finding[] = [];
    const blockedByMeta = metaRobots !== "" && blocksIndexing(metaRobots);
    const blockedByHeader = headerRobots !== "" && blocksIndexing(headerRobots);

    if (blockedByMeta) {
      findings.push({
        severity: "info",
        message: `Page requests noindex via meta robots: "${metaRobots}"`,
      });
    }
    if (blockedByHeader) {
      findings.push({
        severity: "info",
        message: `Page requests noindex via X-Robots-Tag: "${headerRobots}"`,
      });
    }

    return makeResult(this, {
      status: "info",
      observations: {
        indexable: !(blockedByMeta || blockedByHeader),
        metaRobots,
        xRobotsTag: headerRobots,
      },
      findings,
    });
  },
};
