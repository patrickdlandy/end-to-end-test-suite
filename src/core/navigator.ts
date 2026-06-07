import type { Browser } from "playwright";
import type {
  CapturedCookie,
  CapturedRequest,
  CapturedResponse,
  ConsoleMessage,
  PageArtifacts,
} from "./artifacts.js";
import type { ResolvedTarget } from "../config/schema.js";
import type { Capability } from "../checks/types.js";
import { captureAxe } from "./axe.js";
import { capturePrivacySignals, fingerprintInitScript } from "./privacy-probe.js";
import { hostOf, isThirdParty } from "../util/domain.js";

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name.toLowerCase()] = value;
  }
  return out;
}

/**
 * Navigate to a target with Playwright and capture a PageArtifacts bundle.
 *
 * Listeners are attached before navigation so nothing is missed. The browser is
 * owned by the caller (a BrowserSession) so the same instance can also serve
 * Lighthouse over its debugging port — one browser process, many analyzers.
 */
export async function captureArtifacts(
  browser: Browser,
  target: ResolvedTarget,
  caps: ReadonlySet<Capability> = new Set(),
): Promise<PageArtifacts> {
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];
  const consoleMessages: ConsoleMessage[] = [];

  const context = await browser.newContext(
    target.userAgent ? { userAgent: target.userAgent } : {},
  );
  try {
    const page = await context.newPage();

    const pageHost = hostOf(target.url);

    if (caps.has("privacy")) {
      await page.addInitScript(fingerprintInitScript);
    }

    page.on("request", (request) => {
      const host = hostOf(request.url());
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        host,
        thirdParty: isThirdParty(host, pageHost),
      });
    });

    page.on("response", (response) => {
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: normalizeHeaders(response.headers()),
      });
    });

    page.on("console", (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()?.url || undefined,
      });
    });

    const start = Date.now();
    const mainResponse = await page.goto(target.url, {
      waitUntil: target.waitUntil,
      timeout: target.timeoutMs,
    });
    const finalUrl = page.url();
    const html = await page.content();
    const title = await page.title();

    const cookies: CapturedCookie[] = (await context.cookies()).map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expires: c.expires,
    }));

    const mainResponseHeaders = mainResponse
      ? normalizeHeaders(mainResponse.headers())
      : {};

    // axe and privacy probes must read the live page, so they run here (not in a check).
    const axe = caps.has("axe") ? await captureAxe(page) : undefined;
    const privacy = caps.has("privacy") ? await capturePrivacySignals(page) : undefined;

    const artifacts: PageArtifacts = {
      requestedUrl: target.url,
      finalUrl,
      status: mainResponse?.status() ?? 0,
      isHttps: finalUrl.startsWith("https://"),
      mainResponseHeaders,
      html,
      title,
      cookies,
      requests,
      responses,
      console: consoleMessages,
      captureDurationMs: Date.now() - start,
      axe,
      privacy,
    };

    return artifacts;
  } finally {
    await context.close();
  }
}
