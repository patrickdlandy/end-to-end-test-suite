import { CATEGORIES } from "../checks/types.js";
import type { Budgets, ResolvedTarget } from "./schema.js";

/** Built-in defaults applied to every target before user defaults/overrides. */
export const BUILTIN_DEFAULTS: Omit<ResolvedTarget, "url"> = {
  device: "mobile",
  categories: [...CATEGORIES],
  runs: 3,
  timeoutMs: 60_000,
  waitUntil: "networkidle",
  userAgent: undefined,
  budgets: {
    security: {
      requiredHeaders: [
        "content-security-policy",
        "strict-transport-security",
        "x-content-type-options",
        "referrer-policy",
      ],
      minTlsVersion: "1.2",
      certMinDaysToExpiry: 14,
      maxVulnLibs: 0,
    },
  } satisfies Budgets,
};
