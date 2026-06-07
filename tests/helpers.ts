import type { PageArtifacts } from "../src/core/artifacts.js";
import type { ResolvedTarget, Budgets } from "../src/config/schema.js";

/** Build a PageArtifacts with sensible defaults, overridable per test. */
export function makeArtifacts(overrides: Partial<PageArtifacts> = {}): PageArtifacts {
  return {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: 200,
    isHttps: true,
    mainResponseHeaders: {},
    html: "<!doctype html><html lang=\"en\"><head><title>Example Page</title></head><body><h1>Hi</h1></body></html>",
    title: "Example Page",
    cookies: [],
    requests: [],
    responses: [],
    console: [],
    captureDurationMs: 1,
    links: [],
    ...overrides,
  };
}

/** Build a ResolvedTarget with sensible defaults, overridable per test. */
export function makeTarget(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  const { budgets, ...rest } = overrides;
  return {
    url: "https://example.com/",
    device: "mobile",
    categories: ["security"],
    runs: 1,
    timeoutMs: 5000,
    waitUntil: "load",
    budgets: (budgets ?? {}) as Budgets,
    ...rest,
  };
}
