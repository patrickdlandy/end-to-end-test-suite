import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/**
 * Flags the dangerous CORS combination on the main document response:
 * `Access-Control-Allow-Origin: *` together with
 * `Access-Control-Allow-Credentials: true`, which the spec forbids and which
 * indicates a misconfiguration that can leak credentialed responses.
 */
export const corsCheck: Check = {
  id: "security.cors",
  category: "security",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const headers = artifacts.mainResponseHeaders;
    const acao = headers["access-control-allow-origin"];
    const acac = headers["access-control-allow-credentials"];
    const findings: Finding[] = [];

    if (acao === "*" && acac?.toLowerCase() === "true") {
      findings.push({
        severity: "error",
        message: "CORS misconfiguration: Access-Control-Allow-Origin: * with credentials enabled",
        remediation: "Echo a specific allowed origin instead of '*' when credentials are allowed.",
        detail: { acao, acac },
      });
    }

    return makeResult(this, {
      status: findings.length === 0 ? "pass" : "fail",
      observations: { acao: acao ?? null, acac: acac ?? null },
      findings,
    });
  },
};
