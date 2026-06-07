import type { LighthouseResult } from "./lighthouse-runner.js";
import type { TlsInfo } from "./tls.js";
import type { AxeSummary } from "./axe.js";
import type { PrivacySignals } from "./privacy-probe.js";

/**
 * PageArtifacts — the shared bundle captured by a single navigation.
 *
 * Core architectural idea: navigate once, then let every check analyze the same
 * captured artifacts. Heavy/expensive captures (e.g. Lighthouse) are added by
 * later phases and attached here so checks remain pure analyzers over data.
 */

export interface CapturedHeader {
  name: string;
  value: string;
}

export interface CapturedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None" | undefined;
  expires: number;
}

export interface CapturedRequest {
  url: string;
  method: string;
  resourceType: string;
  /** Host portion of the request URL, lowercased. */
  host: string;
  /** True when the request host is not same-site with the page. */
  thirdParty: boolean;
}

export interface CapturedResponse {
  url: string;
  status: number;
  /** Response headers, names lowercased. */
  headers: Record<string, string>;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  location?: string;
}

/**
 * Everything observed from one navigation. Optional fields are populated by
 * later phases (Lighthouse, axe, TLS) and may be undefined in Phase 0.
 */
export interface PageArtifacts {
  /** The URL requested. */
  requestedUrl: string;
  /** The URL after any redirects. */
  finalUrl: string;
  /** HTTP status of the main document response. */
  status: number;
  /** Whether the final URL is served over HTTPS. */
  isHttps: boolean;
  /** Main document response headers, names lowercased. */
  mainResponseHeaders: Record<string, string>;
  /** Full rendered HTML of the document. */
  html: string;
  /** Document title, if any. */
  title: string;
  /** All cookies set in the browser context after load. */
  cookies: CapturedCookie[];
  /** Every request observed during navigation. */
  requests: CapturedRequest[];
  /** Every response observed during navigation. */
  responses: CapturedResponse[];
  /** Browser console messages emitted during navigation. */
  console: ConsoleMessage[];
  /** Wall-clock time the navigation + capture took, in ms. */
  captureDurationMs: number;
  /** Median-aggregated Lighthouse result; present only when a check needs it. */
  lighthouse?: LighthouseResult;
  /** TLS handshake facts; present only when a check needs it. */
  tls?: TlsInfo;
  /** axe-core accessibility results; present only when a check needs it. */
  axe?: AxeSummary;
  /** Privacy signals (fingerprinting counters + consent); present only when needed. */
  privacy?: PrivacySignals;
}
