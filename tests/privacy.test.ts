import { describe, it, expect } from "vitest";
import { makeArtifacts, makeTarget } from "./helpers.js";
import { isThirdParty, registrableDomain } from "../src/util/domain.js";
import { classifyHost, trackerDbAvailable } from "../src/core/trackers-db.js";
import { trackersCheck } from "../src/checks/privacy/trackers.js";
import { thirdPartyCookiesCheck } from "../src/checks/privacy/third-party-cookies.js";
import { fingerprintingCheck } from "../src/checks/privacy/fingerprinting.js";
import { consentCheck } from "../src/checks/privacy/consent.js";
import type { CapturedRequest } from "../src/core/artifacts.js";
import type { PrivacySignals } from "../src/core/privacy-probe.js";

function req(url: string, thirdParty: boolean): CapturedRequest {
  return { url, method: "GET", resourceType: "script", host: new URL(url).host.toLowerCase(), thirdParty };
}

function signals(overrides: Partial<PrivacySignals> = {}): PrivacySignals {
  return {
    fingerprint: { canvas: 0, webgl: 0, audio: 0, font: 0, navigator: 0, total: 0 },
    consent: { cmps: [], hasBanner: false },
    ...overrides,
  };
}

describe("domain util", () => {
  it("computes registrable domain and third-party status", () => {
    expect(registrableDomain("www.sub.example.com")).toBe("example.com");
    expect(registrableDomain(".example.com")).toBe("example.com");
    expect(isThirdParty("cdn.other.com", "www.example.com")).toBe(true);
    expect(isThirdParty("assets.example.com", "www.example.com")).toBe(false);
  });
});

describe("tracker classification", () => {
  it("loads the vendored blocklist", () => {
    expect(trackerDbAvailable()).toBe(true);
  });
  it("classifies a well-known analytics host as a tracker", () => {
    expect(classifyHost("www.google-analytics.com")).not.toBeNull();
  });
  it("does not classify a benign first-party host", () => {
    expect(classifyHost("assets.my-unique-site-12345.com")).toBeNull();
  });
});

describe("trackersCheck", () => {
  it("fails when tracker count exceeds budget", async () => {
    const result = await trackersCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { maxThirdPartyTrackers: 0 } } }),
      artifacts: makeArtifacts({
        requests: [req("https://www.google-analytics.com/analytics.js", true)],
      }),
    });
    expect(result.status).toBe("fail");
    expect(result.observations.trackerCount).toBeGreaterThanOrEqual(1);
  });

  it("passes when there are no third-party trackers", async () => {
    const result = await trackersCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { maxThirdPartyTrackers: 5 } } }),
      artifacts: makeArtifacts({ requests: [req("https://assets.example.com/app.js", false)] }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("thirdPartyCookiesCheck", () => {
  it("fails when third-party cookies exceed budget", async () => {
    const result = await thirdPartyCookiesCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { maxThirdPartyCookies: 0 } } }),
      artifacts: makeArtifacts({
        cookies: [{ name: "_ga", value: "x", domain: ".doubleclick.net", path: "/", secure: true, httpOnly: false, sameSite: "None", expires: -1 }],
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes with only first-party cookies", async () => {
    const result = await thirdPartyCookiesCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { maxThirdPartyCookies: 0 } } }),
      artifacts: makeArtifacts({
        cookies: [{ name: "sid", value: "x", domain: "example.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax", expires: -1 }],
      }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("fingerprintingCheck", () => {
  it("warns on heavy canvas/webgl usage", async () => {
    const result = await fingerprintingCheck.run({
      target: makeTarget({ categories: ["privacy"] }),
      artifacts: makeArtifacts({ privacy: signals({ fingerprint: { canvas: 5, webgl: 4, audio: 0, font: 0, navigator: 0, total: 9 } }) }),
    });
    expect(result.status).toBe("warn");
  });

  it("passes with light API usage", async () => {
    const result = await fingerprintingCheck.run({
      target: makeTarget({ categories: ["privacy"] }),
      artifacts: makeArtifacts({ privacy: signals() }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("consentCheck", () => {
  it("fails when a banner is required but none is found", async () => {
    const result = await consentCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { requireConsentBanner: true } } }),
      artifacts: makeArtifacts({ privacy: signals() }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes when a CMP is detected", async () => {
    const result = await consentCheck.run({
      target: makeTarget({ categories: ["privacy"], budgets: { privacy: { requireConsentBanner: true } } }),
      artifacts: makeArtifacts({ privacy: signals({ consent: { cmps: ["OneTrust"], hasBanner: true } }) }),
    });
    expect(result.status).toBe("pass");
  });
});
