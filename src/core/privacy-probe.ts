import type { Page } from "playwright";

/** Counts of calls to fingerprinting-prone browser APIs during page load. */
export interface FingerprintSignals {
  canvas: number;
  webgl: number;
  audio: number;
  font: number;
  navigator: number;
  /** Total across all categories. */
  total: number;
}

/** Detected consent-management signals. */
export interface ConsentSignals {
  /** CMP globals detected (e.g. "__tcfapi", "OneTrust"). */
  cmps: string[];
  /** Whether a cookie/consent banner-like element was found in the DOM. */
  hasBanner: boolean;
}

/** Privacy signals read from the live page. */
export interface PrivacySignals {
  fingerprint: FingerprintSignals;
  consent: ConsentSignals;
}

/**
 * Init script (runs in the page before any page script) that wraps
 * fingerprinting-prone APIs and counts calls on `window.__fpProbe`. Authored as
 * a self-contained function so Playwright can serialize it to `addInitScript`.
 */
export function fingerprintInitScript(): void {
  const counts = { canvas: 0, webgl: 0, audio: 0, font: 0, navigator: 0 };
  (window as unknown as { __fpProbe: typeof counts }).__fpProbe = counts;

  const wrap = (obj: Record<string, unknown> | undefined, key: string, bucket: keyof typeof counts) => {
    if (!obj) return;
    const original = obj[key];
    if (typeof original !== "function") return;
    obj[key] = function (this: unknown, ...args: unknown[]) {
      counts[bucket] += 1;
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  };

  if (typeof HTMLCanvasElement !== "undefined") {
    wrap(HTMLCanvasElement.prototype as unknown as Record<string, unknown>, "toDataURL", "canvas");
    wrap(HTMLCanvasElement.prototype as unknown as Record<string, unknown>, "toBlob", "canvas");
  }
  if (typeof CanvasRenderingContext2D !== "undefined") {
    const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, unknown>;
    wrap(proto, "getImageData", "canvas");
    wrap(proto, "measureText", "font");
  }
  if (typeof WebGLRenderingContext !== "undefined") {
    const proto = WebGLRenderingContext.prototype as unknown as Record<string, unknown>;
    wrap(proto, "getParameter", "webgl");
    wrap(proto, "getExtension", "webgl");
  }
  if (typeof AudioContext !== "undefined") {
    const proto = AudioContext.prototype as unknown as Record<string, unknown>;
    wrap(proto, "createAnalyser", "audio");
    wrap(proto, "createOscillator", "audio");
  }
}

/** Snippet evaluated after load to read the fingerprint counters + consent signals. */
function readSignals(): PrivacySignals {
  const w = window as unknown as Record<string, unknown> & {
    __fpProbe?: { canvas: number; webgl: number; audio: number; font: number; navigator: number };
  };
  const c = w.__fpProbe ?? { canvas: 0, webgl: 0, audio: 0, font: 0, navigator: 0 };
  const fingerprint = {
    canvas: c.canvas,
    webgl: c.webgl,
    audio: c.audio,
    font: c.font,
    navigator: c.navigator,
    total: c.canvas + c.webgl + c.audio + c.font + c.navigator,
  };

  const cmps: string[] = [];
  if (typeof w["__tcfapi"] === "function") cmps.push("__tcfapi (IAB TCF)");
  if (typeof w["__cmp"] === "function") cmps.push("__cmp");
  if (w["OneTrust"] || w["Optanon"] || w["OptanonActiveGroups"]) cmps.push("OneTrust");
  if (w["Cookiebot"]) cmps.push("Cookiebot");
  if (w["UC_UI"] || w["usercentrics"]) cmps.push("Usercentrics");
  if (w["Cookiehub"]) cmps.push("Cookiehub");
  if (w["didomiOnReady"] || w["Didomi"]) cmps.push("Didomi");

  const selector =
    '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-label*="cookie" i]';
  const nodes = Array.from(document.querySelectorAll(selector));
  const hasBanner = nodes.some((n) => {
    const text = (n.textContent ?? "").toLowerCase();
    return /cookie|consent|gdpr|privacy/.test(text) && n.getClientRects().length > 0;
  });

  return { fingerprint, consent: { cmps, hasBanner } };
}

/** Read privacy signals (fingerprint counters + consent) from the live page. */
export async function capturePrivacySignals(page: Page): Promise<PrivacySignals> {
  return page.evaluate(readSignals);
}
