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

- **Phase 4 (reporting + CI)** — reporters beyond JSON/terminal: a self-contained
  **HTML** report, **JUnit XML** (for CI test-reporters), and **GitHub
  annotations** (`::error`/`::warning` + job-summary markdown). Plus a GitHub
  Actions workflow (`.github/workflows/audit.yml`), a scheduled dataset-refresh
  workflow, a `dist` asset-copy step so the compiled bin finds vendored data, and
  an `npm run refresh-data` script.

- **Phase 5 (auth + crawl)** — activates the config blocks that were designed in
  from the start:
  - **auth** — per-target `basic` / `bearer` / `header` / `cookie` / `form` login.
    Secrets are written as `${ENV:VAR}` and resolved from the environment at load
    time (fails fast if a var is missing); auth is applied to the browser context
    before capture and never serialized into reports. See
    [`config/examples/auth.config.yaml`](config/examples/auth.config.yaml).
  - **crawl** — treat each target as a seed and BFS its links
    (`maxDepth`/`maxPages`/`sameOrigin`/`include`/`exclude`/`respectRobots`); every
    discovered page is audited across all enabled categories. See
    [`config/examples/crawl.config.yaml`](config/examples/crawl.config.yaml).

All planned phases are implemented. See
`/home/patrick/.claude/plans/help-me-make-a-smooth-curry.md` for the roadmap.

## Responsible use (auditing sites you don't own)

A full run loads each page in a real browser once for capture and again per
Lighthouse `runs`, so high `runs`, crawling (`maxPages` × `runs`), many targets,
or repeated CI runs against a third-party origin can look abusive and may trigger
rate limiting or anti-bot challenges. Auditing a site you don't own can also
breach its Terms of Service even though the security/TLS/header checks themselves
are passive.

The suite ships **polite defaults** via the run-level `politeness` block:

| Field | Default | Effect |
|---|---|---|
| `minRequestIntervalMs` | `1000` | Minimum spacing between hits to the same host (also spaces repeated Lighthouse runs). |
| `maxConcurrency` | `2` | Max targets navigated in parallel (CLI `--concurrency` overrides). |
| `respectRobots` | `false` | When `true`, a primary target URL disallowed by robots.txt is skipped, not fetched. |
| `throttleLocalhost` | `false` | The throttle is skipped for loopback/`localhost`/`.local` so dev audits stay fast. |

For a site you don't own, start from
[`config/examples/polite.config.yaml`](config/examples/polite.config.yaml):
`runs: 1`, `respectRobots: true`, and an identifying `userAgent` (transparent, but
note some WAFs block obvious bots — drop it to present as a normal headless
browser). Even so, anti-bot systems may serve a challenge/stripped page rather
than real content; that surfaces as a navigation failure or skewed results, not a
suite error.

### Reporters

Select with `ci.reporters` in config or `--reporters`. Files are written under
`--out-dir` (default `reports/`): `json`→`audit.json`, `html`→`audit.html`,
`junit`→`junit.xml`; `terminal` and `github` write to stdout.

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
audit run --config <path> [--out-dir reports] [--concurrency 4] [--reporters json,html,junit,github,terminal]
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
