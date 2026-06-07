import { describe, it, expect } from "vitest";
import { resolveSecrets } from "../src/config/load.js";
import { buildContextOptions } from "../src/core/auth.js";
import {
  parseRobots,
  robotsAllows,
  normalizeUrl,
  isCrawlable,
  crawlSeed,
  type CrawlResult,
} from "../src/core/crawl.js";
import { makeTarget } from "./helpers.js";
import type { CrawlConfig } from "../src/config/schema.js";

describe("resolveSecrets", () => {
  it("replaces ${ENV:VAR} from the environment", () => {
    const out = resolveSecrets({ a: "${ENV:TOK}", nested: ["x", "${ENV:TOK}"] }, { TOK: "secret" });
    expect(out).toEqual({ a: "secret", nested: ["x", "secret"] });
  });

  it("throws listing missing variables", () => {
    expect(() => resolveSecrets({ a: "${ENV:NOPE}" }, {})).toThrow(/NOPE/);
  });
});

describe("buildContextOptions (auth)", () => {
  it("maps basic auth to httpCredentials", () => {
    const opts = buildContextOptions(makeTarget({ auth: { type: "basic", username: "u", password: "p" } }));
    expect(opts.httpCredentials).toEqual({ username: "u", password: "p" });
  });

  it("maps bearer auth to an Authorization header", () => {
    const opts = buildContextOptions(makeTarget({ auth: { type: "bearer", token: "abc" } }));
    expect(opts.extraHTTPHeaders?.Authorization).toBe("Bearer abc");
  });
});

describe("robots parsing", () => {
  it("collects Disallow rules for the wildcard agent", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private\nDisallow: /tmp\n\nUser-agent: bot\nDisallow: /");
    expect(rules.disallow).toEqual(["/private", "/tmp"]);
    expect(robotsAllows(rules, "/public")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
  });
});

describe("isCrawlable", () => {
  const crawl: CrawlConfig = {
    maxDepth: 2,
    maxPages: 20,
    sameOrigin: true,
    include: [],
    exclude: ["\\.pdf$"],
    respectRobots: true,
  };
  const origin = "https://example.com";

  it("rejects cross-origin when sameOrigin is set", () => {
    expect(isCrawlable("https://other.com/x", origin, crawl, null, [], [])).toBe(false);
  });
  it("rejects excluded patterns and honors robots", () => {
    expect(isCrawlable("https://example.com/a.pdf", origin, crawl, null, [], [/\.pdf$/])).toBe(false);
    expect(isCrawlable("https://example.com/ok", origin, crawl, { disallow: ["/ok"] }, [], [])).toBe(false);
    expect(isCrawlable("https://example.com/ok", origin, crawl, { disallow: [] }, [], [])).toBe(true);
  });

  it("normalizes away fragments", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });
});

describe("crawlSeed BFS", () => {
  const seed = makeTarget({ url: "https://example.com/", categories: ["security"] });
  const crawl: CrawlConfig = {
    maxDepth: 1,
    maxPages: 10,
    sameOrigin: true,
    include: [],
    exclude: [],
    respectRobots: false,
  };

  it("expands one level and dedupes/limits", async () => {
    const pages: Record<string, string[]> = {
      "https://example.com/": ["https://example.com/a", "https://example.com/b", "https://example.com/"],
      "https://example.com/a": ["https://example.com/deep"], // depth 2, should NOT be crawled
      "https://example.com/b": [],
    };
    const visited: string[] = [];
    const runOne = async (t: { url: string }): Promise<CrawlResult> => {
      visited.push(t.url);
      return {
        report: { url: t.url, finalUrl: t.url, status: 200, ok: true, results: [], captureDurationMs: 1 },
        links: pages[t.url] ?? [],
      };
    };
    const reports = await crawlSeed(seed, crawl, runOne);
    expect(visited).toEqual(["https://example.com/", "https://example.com/a", "https://example.com/b"]);
    expect(reports).toHaveLength(3);
  });

  it("respects maxPages", async () => {
    const runOne = async (t: { url: string }): Promise<CrawlResult> => ({
      report: { url: t.url, finalUrl: t.url, status: 200, ok: true, results: [], captureDurationMs: 1 },
      links: ["https://example.com/x", "https://example.com/y", "https://example.com/z"],
    });
    const reports = await crawlSeed(seed, { ...crawl, maxPages: 2 }, runOne);
    expect(reports).toHaveLength(2);
  });
});
