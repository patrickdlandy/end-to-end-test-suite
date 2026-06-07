#!/usr/bin/env node
// Refresh the vendored vulnerability/tracker datasets. Run on a schedule (CI)
// so audits stay current while remaining reproducible between runs.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "src/data");

const SOURCES = [
  {
    name: "retire.js vulnerability repository",
    url: "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v5.json",
    file: "retire-jsrepository.json",
  },
  {
    name: "Disconnect tracker list",
    url: "https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json",
    file: "disconnect-services.json",
  },
];

let failed = false;
for (const source of SOURCES) {
  try {
    const res = await fetch(source.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text); // validate it parses
    const out = resolve(dataDir, source.file);
    writeFileSync(out, text, "utf8");
    console.log(`Updated ${source.name}: ${text.length} bytes -> ${out}`);
  } catch (err) {
    failed = true;
    console.error(`Failed to refresh ${source.name}: ${err instanceof Error ? err.message : err}`);
  }
}

process.exit(failed ? 1 : 0);
