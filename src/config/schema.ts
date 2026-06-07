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
    // --- extensibility placeholders (parsed, not yet implemented) ---
    auth: z.null().optional(),
    crawl: z.null().optional(),
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

export const auditConfigSchema = z
  .object({
    version: z.literal(1),
    defaults: baseSettingsSchema.default({}),
    targets: z.array(targetSchema).min(1),
    ci: ciSchema.default({ failOn: ["error"], reporters: ["json", "terminal"] }),
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
}
