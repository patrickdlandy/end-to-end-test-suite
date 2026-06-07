import { connect, type PeerCertificate } from "node:tls";
import type { ResolvedTarget } from "../config/schema.js";

/** Observed TLS handshake facts for a target's host. */
export interface TlsInfo {
  host: string;
  port: number;
  /** Negotiated protocol, e.g. "TLSv1.3". Undefined if the handshake failed. */
  protocol?: string;
  /** Whether the certificate chain was authorized by a trusted root. */
  authorized: boolean;
  authorizationError?: string;
  /** Certificate validity window. */
  validFrom?: string;
  validTo?: string;
  /** Whole days from now until the cert expires (negative if already expired). */
  daysToExpiry?: number;
  subject?: string;
  issuer?: string;
  /** Set when the connection could not be established at all. */
  error?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Certificate name fields may be a string or string[]; normalize to a string. */
function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

function daysUntil(validTo: string, nowMs: number): number {
  const expiry = Date.parse(validTo);
  if (Number.isNaN(expiry)) return NaN;
  return Math.floor((expiry - nowMs) / MS_PER_DAY);
}

/**
 * Open a TLS connection to the target's host:443 and capture certificate and
 * protocol facts. Resolves with an `error` field rather than rejecting so a
 * failed handshake is reportable as a finding rather than crashing the run.
 *
 * `nowMs` is injectable for deterministic expiry math in tests.
 */
export function captureTls(target: ResolvedTarget, nowMs = Date.now()): Promise<TlsInfo> {
  const url = new URL(target.url);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  return new Promise((resolve) => {
    if (url.protocol !== "https:") {
      resolve({ host, port, authorized: false, error: "target is not served over HTTPS" });
      return;
    }

    const socket = connect(
      { host, port, servername: host, timeout: target.timeoutMs, rejectUnauthorized: false },
      () => {
        const cert: PeerCertificate = socket.getPeerCertificate();
        const validTo = cert.valid_to;
        resolve({
          host,
          port,
          protocol: socket.getProtocol() ?? undefined,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError
            ? String(socket.authorizationError)
            : undefined,
          validFrom: cert.valid_from,
          validTo,
          daysToExpiry: validTo ? daysUntil(validTo, nowMs) : undefined,
          subject: asString(cert.subject?.CN),
          issuer: asString(cert.issuer?.CN),
        });
        socket.end();
      },
    );

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ host, port, authorized: false, error: "TLS handshake timed out" });
    });
    socket.on("error", (err) => {
      resolve({ host, port, authorized: false, error: err.message });
    });
  });
}
