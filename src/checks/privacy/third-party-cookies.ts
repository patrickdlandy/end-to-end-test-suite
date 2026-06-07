import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";
import { hostOf, isThirdParty } from "../../util/domain.js";

/**
 * Counts third-party cookies (cookie domain not same-site with the page) and
 * fails when the count exceeds `maxThirdPartyCookies`.
 */
export const thirdPartyCookiesCheck: Check = {
  id: "privacy.third-party-cookies",
  category: "privacy",
  needs: ["artifacts"],
  run({ target, artifacts }: CheckContext): CheckResult {
    const pageHost = hostOf(artifacts.finalUrl || target.url);
    const thirdParty = artifacts.cookies.filter((c) => isThirdParty(c.domain, pageHost));

    const max = target.budgets.privacy?.maxThirdPartyCookies ?? Infinity;
    const findings: Finding[] = [];

    if (thirdParty.length > 0) {
      findings.push({
        severity: thirdParty.length > max ? "error" : "warning",
        message: `${thirdParty.length} third-party cookie(s) set`,
        remediation: "Avoid setting third-party cookies; prefer first-party storage.",
        detail: { cookies: thirdParty.map((c) => ({ name: c.name, domain: c.domain })) },
      });
    }

    return makeResult(this, {
      status: thirdParty.length > max ? "fail" : thirdParty.length > 0 ? "warn" : "pass",
      observations: {
        totalCookies: artifacts.cookies.length,
        thirdPartyCount: thirdParty.length,
      },
      findings,
    });
  },
};
