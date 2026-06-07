import { describe, it, expect } from "vitest";
import { securityHeadersCheck } from "../src/checks/security/security-headers.js";
import type { PageArtifacts } from "../src/core/artifacts.js";
import type { ResolvedTarget } from "../src/config/schema.js";

function artifacts(headers: Record<string, string>): PageArtifacts {
  return {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: 200,
    isHttps: true,
    mainResponseHeaders: headers,
    html: "<!doctype html><title>x</title>",
    title: "x",
    cookies: [],
    requests: [],
    responses: [],
    console: [],
    captureDurationMs: 1,
    links: [],
  };
}

function target(requiredHeaders: string[]): ResolvedTarget {
  return {
    url: "https://example.com/",
    device: "mobile",
    categories: ["security"],
    runs: 1,
    timeoutMs: 1000,
    waitUntil: "load",
    budgets: { security: { requiredHeaders } },
  };
}

describe("securityHeadersCheck", () => {
  it("passes when all required headers are present", async () => {
    const result = await securityHeadersCheck.run({
      target: target(["content-security-policy", "x-content-type-options"]),
      artifacts: artifacts({
        "content-security-policy": "default-src 'self'",
        "x-content-type-options": "nosniff",
      }),
    });
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("fails and reports each missing header as an error", async () => {
    const result = await securityHeadersCheck.run({
      target: target(["content-security-policy", "strict-transport-security"]),
      artifacts: artifacts({ "content-security-policy": "default-src 'self'" }),
    });
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.5);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("error");
    expect(result.findings[0]?.message).toContain("strict-transport-security");
    expect(result.findings[0]?.remediation).toBeTruthy();
  });

  it("passes when no headers are required", async () => {
    const result = await securityHeadersCheck.run({
      target: target([]),
      artifacts: artifacts({}),
    });
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });
});
