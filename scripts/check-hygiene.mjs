#!/usr/bin/env node
// Hygiene gate: shipped content must be project-agnostic — no personal
// filesystem paths and no references to the private projects this methodology
// was extracted from. Patterns are assembled from fragments so this file and
// quest validation loops can name the gate without tripping it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const SKIP_DIRS = new Set([".git", "node_modules"]);
const SKIP_FILES = new Set(["scripts/check-hygiene.mjs"]);

const patterns = [
  new RegExp("/Use" + "rs/[a-z]"), // absolute personal home paths
  new RegExp("mono" + "-agent"),
  new RegExp("work" + "lab"),
  new RegExp("robertsre" + "berski", "i"),
];
// The repository/author fields in manifests and LICENSE legitimately carry the
// owner's name; exempt exact-file allowlist rather than weakening the pattern.
const OWNER_OK = new Set([
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "package.json",
]);

let failures = 0;
function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue; // dangling symlink
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) scan(full);
      continue;
    }
    if (SKIP_FILES.has(rel)) continue;
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue; // binary or unreadable
    }
    for (const p of patterns) {
      // The owner's name legitimately appears in manifests/LICENSE/README and in
      // the dogfood journal (.quests/ records cite this repo's own URLs).
      if (p.source.includes("robertsre") && (OWNER_OK.has(rel) || rel.startsWith(".quests/"))) continue;
      const m = text.match(p);
      if (m) {
        failures++;
        console.error(`HYGIENE ${rel}: matches ${p} ("…${m[0]}…")`);
      }
    }
  }
}

scan(root);
if (failures > 0) {
  console.error(`\nhygiene: ${failures} violation(s). Shipped content must stay project-agnostic.`);
  process.exit(1);
}
console.log("hygiene: OK");
