import { describe, it, expect } from "vitest";
import { median, type LighthouseResult } from "../src/core/lighthouse-runner.js";
import { lighthousePerfCheck } from "../src/checks/performance/lighthouse-perf.js";
import type { PageArtifacts } from "../src/core/artifacts.js";
import type { ResolvedTarget } from "../src/config/schema.js";

describe("median", () => {
  it("returns the middle value for odd-length lists", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even-length lists", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("ignores non-finite values and returns undefined when empty", () => {
    expect(median([])).toBeUndefined();
    expect(median([NaN, Infinity])).toBeUndefined();
  });
});

function artifactsWith(lh: LighthouseResult | undefined): PageArtifacts {
  return {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: 200,
    isHttps: true,
    mainResponseHeaders: {},
    html: "",
    title: "",
    cookies: [],
    requests: [],
    responses: [],
    console: [],
    captureDurationMs: 1,
    lighthouse: lh,
  };
}

function target(performance: ResolvedTarget["budgets"]["performance"]): ResolvedTarget {
  return {
    url: "https://example.com/",
    device: "mobile",
    categories: ["performance"],
    runs: 3,
    timeoutMs: 1000,
    waitUntil: "load",
    budgets: { performance },
  };
}

const goodLh: LighthouseResult = {
  categoryScores: { performance: 0.92 },
  metrics: { lcpMs: 1800, cls: 0.02, tbtMs: 90, fcpMs: 1000, speedIndexMs: 1500, ttiMs: 2000 },
  runs: 3,
};

describe("lighthousePerfCheck", () => {
  it("passes when score and CWV are within budget", async () => {
    const result = await lighthousePerfCheck.run({
      target: target({ score: 0.85, lcpMs: 2500, cls: 0.1, tbtMs: 200 }),
      artifacts: artifactsWith(goodLh),
    });
    expect(result.status).toBe("pass");
    expect(result.score).toBe(0.92);
    expect(result.findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("fails with an error per breached budget", async () => {
    const result = await lighthousePerfCheck.run({
      target: target({ score: 0.95, lcpMs: 1000, cls: 0.01, tbtMs: 50 }),
      artifacts: artifactsWith(goodLh),
    });
    expect(result.status).toBe("fail");
    const errors = result.findings.filter((f) => f.severity === "error");
    // score, LCP, CLS, and TBT all breached
    expect(errors).toHaveLength(4);
  });

  it("reports inpMs as info (lab proxy note), not an error", async () => {
    const result = await lighthousePerfCheck.run({
      target: target({ inpMs: 200 }),
      artifacts: artifactsWith(goodLh),
    });
    expect(result.status).toBe("pass");
    expect(result.findings.some((f) => f.severity === "info")).toBe(true);
  });

  it("skips when no Lighthouse result is present", async () => {
    const result = await lighthousePerfCheck.run({
      target: target({ score: 0.85 }),
      artifacts: artifactsWith(undefined),
    });
    expect(result.status).toBe("skip");
  });
});
