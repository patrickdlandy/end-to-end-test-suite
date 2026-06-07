import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Detects a consent-management mechanism: a known CMP global (IAB TCF, OneTrust,
 * Cookiebot, …) or a cookie/consent banner in the DOM. When the target sets
 * third-party cookies/trackers but exposes no consent mechanism, and the budget
 * requires one, this fails.
 */
export const consentCheck: Check = {
  id: "privacy.consent",
  category: "privacy",
  needs: ["privacy"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const consent = artifacts.privacy?.consent;
    if (!consent) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "No consent signals captured" }],
      });
    }

    const hasMechanism = consent.cmps.length > 0 || consent.hasBanner;
    const required = target.budgets.privacy?.requireConsentBanner === true;
    const findings: Finding[] = [];

    if (!hasMechanism) {
      findings.push({
        severity: required ? "error" : "warning",
        message: "No consent management mechanism detected (no CMP global or banner)",
        remediation: "Add a consent banner / CMP if you set tracking cookies in regulated regions.",
      });
    }

    return makeResult(this, {
      status: hasMechanism ? "pass" : required ? "fail" : "warn",
      observations: {
        hasMechanism,
        cmps: consent.cmps,
        hasBanner: consent.hasBanner,
      },
      findings,
    });
  },
};
