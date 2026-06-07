#!/usr/bin/env node
// Copy vendored data assets into the build output so the compiled bin can
// resolve them at runtime (tsc does not copy non-TS files).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/data");
const dest = resolve(root, "dist/src/data");

if (!existsSync(src)) {
  console.error(`No data directory at ${src}; nothing to copy.`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied data assets: ${src} -> ${dest}`);
