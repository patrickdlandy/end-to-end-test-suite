import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { auditConfigSchema, type AuditConfig, type Budgets, type ResolvedTarget } from "./schema.js";
import { BUILTIN_DEFAULTS } from "./defaults.js";

/** Plain-object check used by the deep merge. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `override` onto `base`, recursing into plain objects. Arrays and
 * scalars from `override` replace those in `base`. `undefined` values in the
 * override are ignored (so partial overrides only touch what they set).
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

export interface LoadedConfig {
  config: AuditConfig;
  targets: ResolvedTarget[];
}

/** Parse a config file (YAML or JSON) into a validated AuditConfig. */
export function parseConfig(source: string, filename: string): AuditConfig {
  const ext = extname(filename).toLowerCase();
  const raw = ext === ".json" ? JSON.parse(source) : parseYaml(source);
  return auditConfigSchema.parse(raw);
}

const ENV_PATTERN = /\$\{ENV:([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Replace `${ENV:VAR}` references with environment values throughout a parsed
 * config. Throws (listing every missing var) so auth never silently runs with
 * empty credentials. `env` is injectable for testing.
 */
export function resolveSecrets<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  const missing = new Set<string>();

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return node.replace(ENV_PATTERN, (_match, name: string) => {
        const resolved = env[name];
        if (resolved === undefined) {
          missing.add(name);
          return "";
        }
        return resolved;
      });
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };

  const result = walk(value) as T;
  if (missing.size > 0) {
    throw new Error(`Missing environment variable(s) for config: ${[...missing].join(", ")}`);
  }
  return result;
}

/** Resolve every target by layering builtin defaults -> user defaults -> target. */
export function resolveTargets(config: AuditConfig): ResolvedTarget[] {
  return config.targets.map((target) => {
    const { url, ...targetOverrides } = target;
    const merged = deepMerge(
      deepMerge(BUILTIN_DEFAULTS, config.defaults),
      targetOverrides,
    );
    return { ...merged, url, budgets: (merged.budgets ?? {}) as Budgets };
  });
}

/** Read, parse, validate, and resolve a config file from disk. */
export function loadConfig(path: string): LoadedConfig {
  const absolute = resolve(path);
  const source = readFileSync(absolute, "utf8");
  const config = resolveSecrets(parseConfig(source, absolute));
  return { config, targets: resolveTargets(config) };
}
