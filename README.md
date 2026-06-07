# end-to-end-test-suite

Suite of comprehensive, platform-agnostic black-box tests for websites.

Provide a list of URLs in a config file and run deep, observable analysis across
six categories — **security, privacy, performance, accessibility, SEO, and best
practices** — using real HTTP requests and a real browser. Works against local
dev servers, staging, and public production URLs, and serves as both a **CI gate**
(configurable budgets → pass/fail exit codes) and an **audit reporter** (JSON for
trend tracking, plus a terminal summary).

## Status

- **Phase 0 (foundation)** — full pipeline proven end-to-end: config → navigate →
  check → budget → report → exit code. Check: `security.headers`.
- **Phase 1 (Lighthouse)** — `performance.lighthouse` runs Lighthouse over the same
  Playwright Chromium via its CDP port, captures Core Web Vitals (LCP/CLS/TBT, FCP,
  Speed Index, TTI), takes the median of N runs, and gates against performance
  budgets. Perf runs are serialized so concurrent measurements don't perturb each
  other.
- **Phase 2 (breadth)** — checks across four more categories:
  - **Security:** `headers`, `tls` (cert trust/expiry/protocol), `cookies`,
    `mixed-content`, `cors`, `server-info`, `vuln-libs` (retire.js against a
    vendored vulnerability DB at `src/data/`).
  - **Accessibility:** `axe` (axe-core, WCAG 2.x AA) gated by impact budgets.
  - **SEO:** `meta`, `indexability`, `robots`, `structured-data`.
  - **Best practices:** `console`, `https`.
- **Phase 3 (privacy)** — all six categories now have checks:
  - **Privacy:** `trackers` (third-party requests classified against a vendored
    Disconnect blocklist by category), `third-party-cookies`, `fingerprinting`
    (canvas/WebGL/audio/font API instrumentation injected before load), `consent`
    (CMP-global + banner detection: IAB TCF, OneTrust, Cookiebot, …).

All six categories are implemented. Later phases cover reporting polish (HTML,
JUnit, GitHub annotations), CI wiring, blocklist/DB refresh tooling, and
auth/crawl activation. See
`/home/patrick/.claude/plans/help-me-make-a-smooth-curry.md` for the roadmap.

> Note: tracker/fingerprint signals depend on third-party scripts actually
> executing. Some sites serve stripped pages to headless browsers or lazy-load
> trackers; `waitUntil: load` often surfaces more than `networkidle` on such sites.

## Quick start

```bash
npm install
npx playwright install chromium

# Security headers (GitHub passes, example.com fails)
npm run audit -- run --config config/examples/smoke.config.yaml

# Lighthouse performance + Core Web Vitals
npm run audit -- run --config config/examples/perf-smoke.config.yaml

# All six categories against one URL
npm run audit -- run --config config/examples/full.config.yaml
```

Exit code is `0` when all budgets pass and `1` when any `failOn` finding occurs —
suitable for CI gating. A JSON report is written to `reports/audit.json` by default.

## Configuration

URLs and budgets live in a YAML (or JSON) config. `defaults` apply to every target
and are deep-merged with per-target overrides. See
[`config/examples/audit.config.yaml`](config/examples/audit.config.yaml) for the
full shape, including the `auth`/`crawl` extensibility placeholders.

```bash
audit run --config <path> [--out reports/audit.json] [--concurrency 4] [--reporters json,terminal]
```

## Architecture

**One navigation, many analyzers.** Each target is visited once with Playwright;
a shared `PageArtifacts` bundle (headers, cookies, requests, console, HTML) is then
analyzed by pluggable checks. Checks implement a small `Check` contract
(`src/checks/types.ts`) and declare what they `need`, so the orchestrator only
performs captures that enabled checks require.

```
src/
  cli/        commander CLI (`run`)
  config/     Zod schema + loader (deep-merge defaults → targets)
  core/       orchestrator, navigator, registry, artifacts
  checks/     pluggable checks, grouped by category
  budgets/    threshold evaluation → AuditReport + exit code
  reporters/  json (canonical), terminal
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # emit to dist/
```
