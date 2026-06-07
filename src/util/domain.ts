/** Lowercase the host of a URL, returning "" if it can't be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * eTLD+1 approximation: last two labels of a host. Good enough for first-party
 * vs third-party classification of the common cases; a public-suffix-list based
 * implementation can replace this if precision is ever required.
 */
export function registrableDomain(host: string): string {
  const clean = host.replace(/^\./, "").toLowerCase();
  const parts = clean.split(".").filter(Boolean);
  if (parts.length <= 2) return clean;
  return parts.slice(-2).join(".");
}

/** True when `host` is not same-site (same registrable domain) as `pageHost`. */
export function isThirdParty(host: string, pageHost: string): boolean {
  if (host === "" || pageHost === "") return false;
  return registrableDomain(host) !== registrableDomain(pageHost);
}
