import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Per-API call counts above which we consider behavior fingerprinting-like. */
const SUSPICION_THRESHOLD = 3;

/**
 * Reports browser-fingerprinting signals captured by the page instrumentation:
 * counts of calls to canvas/WebGL/audio/font APIs commonly used to build a
 * device fingerprint. High counts are warnings (heuristic, not definitive).
 */
export const fingerprintingCheck: Check = {
  id: "privacy.fingerprinting",
  category: "privacy",
  needs: ["privacy"],
  run({ artifacts }: CheckContext): CheckResult {
    const fp = artifacts.privacy?.fingerprint;
    if (!fp) {
      return makeResult(this, {
        status: "skip",
        findings: [{ severity: "info", message: "No fingerprinting signals captured" }],
      });
    }

    const suspicious = (["canvas", "webgl", "audio", "font"] as const).filter(
      (k) => fp[k] >= SUSPICION_THRESHOLD,
    );

    const findings: Finding[] = [];
    if (suspicious.length > 0) {
      findings.push({
        severity: "warning",
        message: `Possible fingerprinting: heavy use of ${suspicious.join(", ")} APIs`,
        remediation: "Confirm these APIs are used for legitimate features, not device fingerprinting.",
        detail: { ...fp },
      });
    }

    return makeResult(this, {
      status: suspicious.length > 0 ? "warn" : "pass",
      observations: { ...fp, suspicious },
      findings,
    });
  },
};
