import { z } from "zod";
import { CATEGORIES } from "../checks/types.js";

/**
 * Config schema — single source of truth. Validated at load time; static types
 * are inferred from these schemas.
 *
 * Design note: `auth` and `crawl` are parsed-but-unused placeholders so the
 * later phases that activate them are config-only, with no pipeline rework.
 */

export const deviceSchema = z.enum(["mobile", "desktop"]);
export const categorySchema = z.enum(CATEGORIES);

/** Per-category budgets. All fields optional so overrides can be partial. */
export const budgetsSchema = z
  .object({
    performance: z
      .object({
        score: z.number().min(0).max(1).optional(),
        lcpMs: z.number().nonnegative().optional(),
        cls: z.number().nonnegative().optional(),
        tbtMs: z.number().nonnegative().optional(),
        inpMs: z.number().nonnegative().optional(),
      })
      .strict()
      .optional(),
    accessibility: z
      .object({
        score: z.number().min(0).max(1).optional(),
        maxCritical: z.number().int().nonnegative().optional(),
        maxSerious: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    seo: z.object({ score: z.number().min(0).max(1).optional() }).strict().optional(),
    bestPractices: z
      .object({ score: z.number().min(0).max(1).optional() })
      .strict()
      .optional(),
    security: z
      .object({
        requiredHeaders: z.array(z.string().toLowerCase()).optional(),
        minTlsVersion: z.string().optional(),
        certMinDaysToExpiry: z.number().nonnegative().optional(),
        maxVulnLibs: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    privacy: z
      .object({
        maxThirdPartyTrackers: z.number().int().nonnegative().optional(),
        requireConsentBanner: z.boolean().optional(),
        maxThirdPartyCookies: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Budgets = z.infer<typeof budgetsSchema>;

/**
 * Authentication for protected targets. Secrets should be written as
 * `${ENV:VAR_NAME}` in config and are resolved from the environment at load time
 * (never commit real credentials). Auth is applied to the browser context before
 * navigation and never serialized into reports.
 */
export const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("basic"), username: z.string(), password: z.string() }).strict(),
  z.object({ type: z.literal("bearer"), token: z.string() }).strict(),
  z.object({ type: z.literal("header"), headers: z.record(z.string()) }).strict(),
  z
    .object({
      type: z.literal("cookie"),
      cookies: z
        .array(
          z
            .object({
              name: z.string(),
              value: z.string(),
              domain: z.string().optional(),
              path: z.string().optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("form"),
      loginUrl: z.string().url(),
      /** Map of CSS selector → value to fill (use ${ENV:...} for secrets). */
      fields: z.record(z.string()),
      /** Selector to click to submit the form. */
      submitSelector: z.string(),
      /** Optional selector to wait for as a success signal after submit. */
      waitForSelector: z.string().optional(),
    })
    .strict(),
]);

export type AuthConfig = z.infer<typeof authSchema>;

/** Crawl configuration: expand each target into linked pages. */
export const crawlSchema = z
  .object({
    maxDepth: z.number().int().nonnegative().default(0),
    maxPages: z.number().int().positive().default(20),
    sameOrigin: z.boolean().default(true),
    /** Regex strings; if non-empty a URL must match at least one to be crawled. */
    include: z.array(z.string()).default([]),
    /** Regex strings; a URL matching any is skipped. */
    exclude: z.array(z.string()).default([]),
    respectRobots: z.boolean().default(true),
  })
  .strict();

export type CrawlConfig = z.infer<typeof crawlSchema>;

/** Settings shared between `defaults` and per-target overrides. */
export const baseSettingsSchema = z
  .object({
    device: deviceSchema.optional(),
    categories: z.array(categorySchema).optional(),
    runs: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
    userAgent: z.string().optional(),
    budgets: budgetsSchema.optional(),
    auth: authSchema.optional(),
    crawl: crawlSchema.optional(),
  })
  .strict();

export const targetSchema = baseSettingsSchema.extend({
  url: z.string().url(),
});

export const ciSchema = z
  .object({
    failOn: z.array(z.enum(["error", "warning"])).default(["error"]),
    reporters: z.array(z.string()).default(["json", "terminal"]),
  })
  .strict();

/**
 * Run-level politeness controls for auditing sites you don't own. Defaults make
 * a run resemble a careful human visitor; the throttle is skipped for local
 * hosts so dev audits stay fast.
 */
export const politenessSchema = z
  .object({
    /** Minimum spacing between navigations to the same host, in ms. */
    minRequestIntervalMs: z.number().int().nonnegative().default(1000),
    /** Cap on concurrent target navigations (CLI --concurrency overrides). */
    maxConcurrency: z.number().int().positive().default(2),
    /** Skip auditing a primary target URL disallowed by robots.txt. */
    respectRobots: z.boolean().default(false),
    /** Also throttle loopback/localhost/.local hosts (off by default). */
    throttleLocalhost: z.boolean().default(false),
  })
  .strict();

export type Politeness = z.infer<typeof politenessSchema>;

export const auditConfigSchema = z
  .object({
    version: z.literal(1),
    defaults: baseSettingsSchema.default({}),
    targets: z.array(targetSchema).min(1),
    ci: ciSchema.default({ failOn: ["error"], reporters: ["json", "terminal"] }),
    politeness: politenessSchema.default({}),
  })
  .strict();

export type AuditConfig = z.infer<typeof auditConfigSchema>;
export type RawTarget = z.infer<typeof targetSchema>;

/**
 * A target with all defaults resolved in — every field the orchestrator needs
 * is guaranteed present. Produced by config/load.ts after deep-merging.
 */
export interface ResolvedTarget {
  url: string;
  device: z.infer<typeof deviceSchema>;
  categories: z.infer<typeof categorySchema>[];
  runs: number;
  timeoutMs: number;
  waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit";
  userAgent?: string;
  budgets: Budgets;
  auth?: AuthConfig;
  crawl?: CrawlConfig;
}
