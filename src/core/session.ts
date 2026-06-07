import { createServer } from "node:net";
import { chromium, type Browser } from "playwright";
import type { ResolvedTarget } from "../config/schema.js";

/** Find a free TCP port on the loopback interface. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * A launched Chromium plus the DevTools debugging port it exposes. The same
 * browser instance serves both the Playwright artifacts capture and Lighthouse
 * (which connects over `port`), so all checks share one browser process.
 */
export interface BrowserSession {
  browser: Browser;
  /** DevTools remote-debugging port — passed to Lighthouse via its `port` flag. */
  port: number;
  close(): Promise<void>;
}

/**
 * Launch a Chromium session with a known, free debugging port. A dedicated port
 * per session avoids cross-target "Target closed" collisions; Lighthouse perf
 * runs are still serialized by the orchestrator so they don't perturb each other.
 */
export async function launchSession(_target: ResolvedTarget): Promise<BrowserSession> {
  const port = await getFreePort();
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"],
  });
  return {
    browser,
    port,
    close: () => browser.close(),
  };
}
