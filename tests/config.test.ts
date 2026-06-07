import { describe, it, expect } from "vitest";
import { parseConfig, resolveTargets, deepMerge } from "../src/config/load.js";

describe("deepMerge", () => {
  it("recurses into plain objects and ignores undefined overrides", () => {
    const merged = deepMerge(
      { a: 1, nested: { x: 1, y: 2 } },
      { a: undefined, nested: { y: 3, z: 4 } },
    );
    expect(merged).toEqual({ a: 1, nested: { x: 1, y: 3, z: 4 } });
  });

  it("replaces arrays rather than concatenating", () => {
    const merged = deepMerge({ list: [1, 2, 3] }, { list: [9] });
    expect(merged).toEqual({ list: [9] });
  });
});

describe("config parse + resolve", () => {
  const yaml = `
version: 1
defaults:
  device: mobile
  categories: [security]
  budgets:
    security:
      requiredHeaders: [content-security-policy]
targets:
  - url: https://example.com/
  - url: https://example.com/pricing
    device: desktop
    budgets:
      security:
        requiredHeaders: [content-security-policy, strict-transport-security]
ci:
  failOn: [error]
  reporters: [json, terminal]
`;

  it("parses valid YAML config", () => {
    const config = parseConfig(yaml, "audit.config.yaml");
    expect(config.targets).toHaveLength(2);
    expect(config.ci.failOn).toEqual(["error"]);
  });

  it("deep-merges defaults into each target with per-target overrides winning", () => {
    const config = parseConfig(yaml, "audit.config.yaml");
    const [first, second] = resolveTargets(config);

    expect(first?.device).toBe("mobile");
    expect(first?.categories).toEqual(["security"]);
    expect(first?.budgets.security?.requiredHeaders).toEqual(["content-security-policy"]);

    expect(second?.device).toBe("desktop");
    expect(second?.budgets.security?.requiredHeaders).toEqual([
      "content-security-policy",
      "strict-transport-security",
    ]);
    // builtin defaults still apply where unset
    expect(second?.runs).toBe(3);
    expect(second?.timeoutMs).toBe(60_000);
  });

  it("rejects configs with an invalid version", () => {
    expect(() => parseConfig(`version: 2\ntargets: []`, "x.yaml")).toThrow();
  });

  it("rejects unknown top-level keys (strict schema)", () => {
    expect(() =>
      parseConfig(`version: 1\ntargets:\n  - url: https://x.com/\nbogus: true`, "x.yaml"),
    ).toThrow();
  });
});
