import type { CrawlConfig, ResolvedTarget } from "../config/schema.js";
import type { TargetReport } from "../budgets/evaluate.js";

/** A target report plus the links discovered on that page (for crawl expansion). */
export interface CrawlResult {
  report: TargetReport;
  links: string[];
}

export type RunOne = (target: ResolvedTarget) => Promise<CrawlResult>;

/** Minimal robots.txt rules: Disallow paths applying to all user-agents. */
export interface RobotsRules {
  disallow: string[];
}

/** Drop the fragment so `#a` variants of one page aren't crawled repeatedly. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** Parse robots.txt, collecting Disallow rules under `User-agent: *`. */
export function parseRobots(text: string): RobotsRules {
  const disallow: string[] = [];
  let appliesToAll = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const [field, ...rest] = line.split(":");
    const key = field?.toLowerCase().trim();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      appliesToAll = value === "*";
    } else if (key === "disallow" && appliesToAll && value !== "") {
      disallow.push(value);
    }
  }
  return { disallow };
}

/** True when robots.txt permits crawling `pathname`. */
export function robotsAllows(rules: RobotsRules, pathname: string): boolean {
  return !rules.disallow.some((rule) => pathname.startsWith(rule));
}

async function loadRobots(origin: string, timeoutMs: number): Promise<RobotsRules> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { disallow: [] };
    return parseRobots(await res.text());
  } catch {
    return { disallow: [] };
  }
}

/** Compile regex strings, skipping (and warning about) invalid patterns. */
function compilePatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p));
    } catch {
      console.error(`Invalid crawl pattern ignored: ${p}`);
    }
  }
  return compiled;
}

/** Decide whether a discovered URL should be crawled. */
export function isCrawlable(
  url: string,
  seedOrigin: string,
  crawl: CrawlConfig,
  robots: RobotsRules | null,
  include: RegExp[],
  exclude: RegExp[],
): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (crawl.sameOrigin && u.origin !== seedOrigin) return false;
  if (include.length > 0 && !include.some((re) => re.test(url))) return false;
  if (exclude.some((re) => re.test(url))) return false;
  if (robots && !robotsAllows(robots, u.pathname)) return false;
  return true;
}

/**
 * Breadth-first crawl from a seed target, running every discovered page through
 * `runOne`. Honors maxDepth, maxPages, sameOrigin, include/exclude, and robots.
 * Pages within a seed run sequentially (polite); seeds run concurrently upstream.
 */
export async function crawlSeed(
  seed: ResolvedTarget,
  crawl: CrawlConfig,
  runOne: RunOne,
): Promise<TargetReport[]> {
  const seedOrigin = new URL(seed.url).origin;
  const robots = crawl.respectRobots ? await loadRobots(seedOrigin, seed.timeoutMs) : null;
  const include = compilePatterns(crawl.include);
  const exclude = compilePatterns(crawl.exclude);

  const visited = new Set<string>([normalizeUrl(seed.url)]);
  const queue: Array<{ url: string; depth: number }> = [{ url: seed.url, depth: 0 }];
  const reports: TargetReport[] = [];

  while (queue.length > 0 && reports.length < crawl.maxPages) {
    const { url, depth } = queue.shift()!;
    const { report, links } = await runOne({ ...seed, url });
    reports.push(report);

    if (depth >= crawl.maxDepth) continue;
    for (const link of links) {
      const normalized = normalizeUrl(link);
      if (visited.has(normalized)) continue;
      if (!isCrawlable(normalized, seedOrigin, crawl, robots, include, exclude)) continue;
      visited.add(normalized);
      queue.push({ url: normalized, depth: depth + 1 });
    }
  }

  return reports;
}
