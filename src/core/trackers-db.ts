import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registrableDomain } from "../util/domain.js";

/**
 * Vendored snapshot of Disconnect's tracker list (categorized). Vendored rather
 * than fetched at runtime for reproducible results; refresh on a schedule.
 */
const DB_PATH = fileURLToPath(new URL("../data/disconnect-services.json", import.meta.url));

/** Disconnect categories we treat as trackers worth flagging. */
const TRACKER_CATEGORIES = new Set([
  "Advertising",
  "Analytics",
  "FingerprintingInvasive",
  "FingerprintingGeneral",
  "Social",
  "Cryptomining",
  "Content",
]);

interface DisconnectServices {
  categories: Record<string, Array<Record<string, Record<string, string[]>>>>;
}

let cachedMap: Map<string, string> | null | undefined;

/** Build (and cache) a domain → category map from the vendored Disconnect list. */
function loadMap(): Map<string, string> | null {
  if (cachedMap !== undefined) return cachedMap;
  try {
    const db = JSON.parse(readFileSync(DB_PATH, "utf8")) as DisconnectServices;
    const map = new Map<string, string>();
    for (const [category, entries] of Object.entries(db.categories)) {
      if (!TRACKER_CATEGORIES.has(category)) continue;
      for (const entry of entries) {
        for (const company of Object.values(entry)) {
          for (const domains of Object.values(company)) {
            if (!Array.isArray(domains)) continue;
            for (const domain of domains) {
              if (!map.has(domain)) map.set(domain.toLowerCase(), category);
            }
          }
        }
      }
    }
    cachedMap = map;
  } catch {
    cachedMap = null;
  }
  return cachedMap;
}

/** True if the blocklist is available (loaded successfully). */
export function trackerDbAvailable(): boolean {
  return loadMap() !== null;
}

/**
 * Classify a host as a tracker. Matches the full host and progressively shorter
 * parent domains down to the registrable domain. Returns the Disconnect category
 * or null if not a known tracker.
 */
export function classifyHost(host: string): string | null {
  const map = loadMap();
  if (!map || host === "") return null;

  const lower = host.toLowerCase();
  const labels = lower.split(".");
  const registrable = registrableDomain(lower);

  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    const hit = map.get(candidate);
    if (hit) return hit;
    if (candidate === registrable) break;
  }
  return map.get(registrable) ?? null;
}
