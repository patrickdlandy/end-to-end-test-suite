import { describe, it, expect } from "vitest";
import { makeArtifacts, makeTarget } from "./helpers.js";
import { tlsCheck } from "../src/checks/security/tls.js";
import { cookiesCheck } from "../src/checks/security/cookies.js";
import { mixedContentCheck } from "../src/checks/security/mixed-content.js";
import { corsCheck } from "../src/checks/security/cors.js";
import { serverInfoCheck } from "../src/checks/security/server-info.js";

describe("tlsCheck", () => {
  const target = makeTarget({ budgets: { security: { certMinDaysToExpiry: 14, minTlsVersion: "1.2" } } });

  it("fails when the certificate is not trusted", async () => {
    const result = await tlsCheck.run({
      target,
      artifacts: makeArtifacts({
        tls: { host: "example.com", port: 443, authorized: false, authorizationError: "self signed", protocol: "TLSv1.3", daysToExpiry: 100 },
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("warns when expiry is within the budget window", async () => {
    const result = await tlsCheck.run({
      target,
      artifacts: makeArtifacts({
        tls: { host: "example.com", port: 443, authorized: true, protocol: "TLSv1.3", daysToExpiry: 5 },
      }),
    });
    expect(result.status).toBe("warn");
  });

  it("fails on a protocol below the minimum version", async () => {
    const result = await tlsCheck.run({
      target,
      artifacts: makeArtifacts({
        tls: { host: "example.com", port: 443, authorized: true, protocol: "TLSv1.1", daysToExpiry: 100 },
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes a healthy certificate", async () => {
    const result = await tlsCheck.run({
      target,
      artifacts: makeArtifacts({
        tls: { host: "example.com", port: 443, authorized: true, protocol: "TLSv1.3", daysToExpiry: 200 },
      }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("cookiesCheck", () => {
  it("warns about insecure cookie flags on HTTPS", async () => {
    const result = await cookiesCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({
        cookies: [{ name: "sid", value: "x", domain: "example.com", path: "/", secure: false, httpOnly: false, sameSite: undefined, expires: -1 }],
      }),
    });
    expect(result.status).toBe("warn");
    expect(result.findings[0]?.message).toContain("missing Secure");
  });

  it("passes a hardened cookie", async () => {
    const result = await cookiesCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({
        cookies: [{ name: "sid", value: "x", domain: "example.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax", expires: -1 }],
      }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("mixedContentCheck", () => {
  it("fails when an http resource loads on an https page", async () => {
    const result = await mixedContentCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({
        requests: [{ url: "http://cdn.example.com/a.js", method: "GET", resourceType: "script", host: "cdn.example.com", thirdParty: true }],
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes with all-secure resources", async () => {
    const result = await mixedContentCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({
        requests: [{ url: "https://cdn.example.com/a.js", method: "GET", resourceType: "script", host: "cdn.example.com", thirdParty: true }],
      }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("corsCheck", () => {
  it("fails on wildcard ACAO with credentials", async () => {
    const result = await corsCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({
        mainResponseHeaders: { "access-control-allow-origin": "*", "access-control-allow-credentials": "true" },
      }),
    });
    expect(result.status).toBe("fail");
  });

  it("passes when not misconfigured", async () => {
    const result = await corsCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({ mainResponseHeaders: { "access-control-allow-origin": "https://app.example.com" } }),
    });
    expect(result.status).toBe("pass");
  });
});

describe("serverInfoCheck", () => {
  it("warns when a version is disclosed", async () => {
    const result = await serverInfoCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({ mainResponseHeaders: { server: "nginx/1.25.3", "x-powered-by": "PHP/8.2.1" } }),
    });
    expect(result.status).toBe("warn");
  });

  it("passes when no version-bearing headers are present", async () => {
    const result = await serverInfoCheck.run({
      target: makeTarget(),
      artifacts: makeArtifacts({ mainResponseHeaders: { server: "cloudflare" } }),
    });
    expect(result.status).toBe("pass");
  });
});
