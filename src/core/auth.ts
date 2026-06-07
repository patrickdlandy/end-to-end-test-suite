import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";
import type { ResolvedTarget } from "../config/schema.js";

/**
 * Build the BrowserContext options for a target, folding in user-agent and the
 * auth mechanisms that must be set at context-creation time (basic credentials,
 * bearer/header auth). Cookie and form auth are applied after creation.
 */
export function buildContextOptions(target: ResolvedTarget): BrowserContextOptions {
  const options: BrowserContextOptions = {};
  if (target.userAgent) options.userAgent = target.userAgent;

  const auth = target.auth;
  if (auth?.type === "basic") {
    options.httpCredentials = { username: auth.username, password: auth.password };
  } else if (auth?.type === "bearer") {
    options.extraHTTPHeaders = { Authorization: `Bearer ${auth.token}` };
  } else if (auth?.type === "header") {
    options.extraHTTPHeaders = { ...auth.headers };
  }
  return options;
}

/**
 * Apply auth that requires a live context: inject cookies, or perform a form
 * login flow (navigate → fill → submit → wait). Runs before the page under test
 * is captured; the resulting session cookies persist for that capture.
 */
export async function applyContextAuth(
  context: BrowserContext,
  target: ResolvedTarget,
): Promise<void> {
  const auth = target.auth;
  if (!auth) return;

  if (auth.type === "cookie") {
    await context.addCookies(
      auth.cookies.map((c) =>
        c.domain
          ? { name: c.name, value: c.value, domain: c.domain, path: c.path ?? "/" }
          : { name: c.name, value: c.value, url: new URL(target.url).origin },
      ),
    );
    return;
  }

  if (auth.type === "form") {
    const page = await context.newPage();
    try {
      await page.goto(auth.loginUrl, { waitUntil: "load", timeout: target.timeoutMs });
      for (const [selector, value] of Object.entries(auth.fields)) {
        await page.fill(selector, value, { timeout: target.timeoutMs });
      }
      await Promise.all([
        page.waitForLoadState("networkidle", { timeout: target.timeoutMs }).catch(() => {}),
        page.click(auth.submitSelector, { timeout: target.timeoutMs }),
      ]);
      if (auth.waitForSelector) {
        await page.waitForSelector(auth.waitForSelector, { timeout: target.timeoutMs });
      }
    } finally {
      await page.close();
    }
  }
}

/** Create a context for a target with all applicable auth applied. */
export async function newAuthedContext(
  browser: Browser,
  target: ResolvedTarget,
): Promise<BrowserContext> {
  const context = await browser.newContext(buildContextOptions(target));
  await applyContextAuth(context, target);
  return context;
}
