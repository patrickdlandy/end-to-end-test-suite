import { describe, it, expect } from "vitest";
import { makeArtifacts, makeTarget } from "./helpers.js";
import { axeCheck } from "../src/checks/accessibility/axe.js";
import { seoMetaCheck } from "../src/checks/seo/meta.js";
import { seoStructuredDataCheck } from "../src/checks/seo/structured-data.js";
import { seoIndexabilityCheck } from "../src/checks/seo/indexability.js";
import { consoleErrorsCheck } from "../src/checks/best-practices/console.js";
import { httpsCheck } from "../src/checks/best-practices/https.js";
import type { AxeSummary } from "../src/core/axe.js";

function axeSummary(overrides: Partial<AxeSummary> = {}): AxeSummary {
  return {
    violations: [],
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    passes: 10,
    incomplete: 0,
    ...overrides,
  };
}

describe("axeCheck", () => {
  it("fails when critical violations exceed budget", async () => {
    const result = await axeCheck.run({
      target: makeTarget({ categories: ["accessibility"], budgets: { accessibility: { maxCritical: 0, maxSerious: 0 } } }),
      artifacts: makeArtifacts({
        axe: axeSummary({
          violations: [{ id: "color-contrast", impact: "critical", help: "Contrast", helpUrl: "https://x", nodeCount: 3, sampleTargets: [".a"] }],
          counts: { critical: 1, serious: 0, moderate: 0, minor: 0 },
        }),
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes a clean page", async () => {
    const result = await axeCheck.run({
      target: makeTarget({ categories: ["accessibility"], budgets: { accessibility: { maxCritical: 0, maxSerious: 0 } } }),
      artifacts: makeArtifacts({ axe: axeSummary() }),
    });
    expect(result.status).toBe("pass");
  });

  it("skips when no axe results captured", async () => {
    const result = await axeCheck.run({ target: makeTarget({ categories: ["accessibility"] }), artifacts: makeArtifacts() });
    expect(result.status).toBe("skip");
  });
});

describe("seoMetaCheck", () => {
  it("warns on missing description and canonical", async () => {
    const result = await seoMetaCheck.run({
      target: makeTarget({ categories: ["seo"] }),
      artifacts: makeArtifacts(),
    });
    expect(result.status).toBe("warn");
    const messages = result.findings.map((f) => f.message).join("\n");
    expect(messages).toContain("meta description");
    expect(messages).toContain("canonical");
  });

  it("passes a well-formed head", async () => {
    const html = `<!doctype html><html lang="en"><head>
      <title>A reasonably descriptive title</title>
      <meta name="description" content="${"x".repeat(80)}">
      <link rel="canonical" href="https://example.com/">
      <meta property="og:title" content="t"><meta property="og:image" content="https://example.com/i.png">
    </head><body><h1>One</h1></body></html>`;
    const result = await seoMetaCheck.run({
      target: makeTarget({ categories: ["seo"] }),
      artifacts: makeArtifacts({ html }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("seoStructuredDataCheck", () => {
  it("detects JSON-LD types", async () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Organization","name":"x"}</script></head><body></body></html>`;
    const result = await seoStructuredDataCheck.run({ target: makeTarget({ categories: ["seo"] }), artifacts: makeArtifacts({ html }) });
    expect(result.observations.types).toEqual(["Organization"]);
  });

  it("warns on invalid JSON-LD", async () => {
    const html = `<html><head><script type="application/ld+json">{not json}</script></head><body></body></html>`;
    const result = await seoStructuredDataCheck.run({ target: makeTarget({ categories: ["seo"] }), artifacts: makeArtifacts({ html }) });
    expect(result.status).toBe("warn");
  });
});

describe("seoIndexabilityCheck", () => {
  it("reports noindex from meta robots", async () => {
    const html = `<html><head><meta name="robots" content="noindex,follow"></head><body></body></html>`;
    const result = await seoIndexabilityCheck.run({ target: makeTarget({ categories: ["seo"] }), artifacts: makeArtifacts({ html }) });
    expect(result.observations.indexable).toBe(false);
  });
});

describe("consoleErrorsCheck", () => {
  it("warns when console errors are present", async () => {
    const result = await consoleErrorsCheck.run({
      target: makeTarget({ categories: ["best-practices"] }),
      artifacts: makeArtifacts({ console: [{ type: "error", text: "boom" }] }),
    });
    expect(result.status).toBe("warn");
  });
});

describe("httpsCheck", () => {
  it("fails on a non-HTTPS page", async () => {
    const result = await httpsCheck.run({
      target: makeTarget({ categories: ["best-practices"] }),
      artifacts: makeArtifacts({ isHttps: false, finalUrl: "http://example.com/" }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes an HTTPS page", async () => {
    const result = await httpsCheck.run({
      target: makeTarget({ categories: ["best-practices"] }),
      artifacts: makeArtifacts(),
    });
    expect(result.status).toBe("pass");
  });
});
