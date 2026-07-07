#!/usr/bin/env node
// Zero-dependency manifest gate: parse the plugin manifests and assert the
// fields each harness needs to list and load the plugin. Collects every problem
// and exits 1 with precise messages, so a broken manifest fails CI loudly rather
// than shipping a listing that silently won't install.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function load(relPath) {
  let text;
  try {
    text = readFileSync(join(root, relPath), "utf8");
  } catch (err) {
    errors.push(`${relPath}: cannot read file (${err.code || err.message})`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    errors.push(`${relPath}: invalid JSON — ${err.message}`);
    return null;
  }
}

// Assert obj[fieldPath] (dotted path) is a non-empty string.
function requireString(obj, relPath, fieldPath, label = fieldPath) {
  if (obj == null) return;
  const value = fieldPath.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${relPath}: required field "${label}" must be a non-empty string`);
  }
}

// .claude-plugin/plugin.json — the Claude Code plugin manifest.
const CLAUDE = ".claude-plugin/plugin.json";
const claude = load(CLAUDE);
for (const f of ["name", "description", "version"]) requireString(claude, CLAUDE, f);

// .claude-plugin/marketplace.json — the marketplace listing that points at the
// plugin source. Requires a non-empty plugins[] with a source on the first entry.
const MARKET = ".claude-plugin/marketplace.json";
const market = load(MARKET);
for (const f of ["name", "description"]) requireString(market, MARKET, f);
if (market != null) {
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) {
    errors.push(`${MARKET}: required field "plugins" must be a non-empty array`);
  } else {
    requireString(market.plugins[0], MARKET, "source", "plugins[0].source");
    requireString(market.plugins[0], MARKET, "name", "plugins[0].name");
  }
}

// .codex-plugin/plugin.json — the Codex plugin manifest; "skills" points at the
// skills directory Codex discovers.
const CODEX = ".codex-plugin/plugin.json";
const codex = load(CODEX);
for (const f of ["name", "description", "version", "skills"]) requireString(codex, CODEX, f);

// hooks/hooks.json — Codex's plugin hook parser rejects unknown top-level
// fields, so this file must remain a strict wrapper around the hooks object.
const HOOKS = "hooks/hooks.json";
const hookConfig = load(HOOKS);
if (hookConfig != null) {
  const topLevelKeys = Object.keys(hookConfig);
  const unknownKeys = topLevelKeys.filter((key) => key !== "hooks");
  if (unknownKeys.length) {
    errors.push(`${HOOKS}: unknown top-level field(s): ${unknownKeys.join(", ")}; expected only "hooks"`);
  }
  if (
    !Object.hasOwn(hookConfig, "hooks") ||
    hookConfig.hooks == null ||
    typeof hookConfig.hooks !== "object" ||
    Array.isArray(hookConfig.hooks)
  ) {
    errors.push(`${HOOKS}: required field "hooks" must be an object`);
  }
}

if (errors.length) {
  console.error("validate-manifests: FAILED");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\nvalidate-manifests: ${errors.length} manifest/hook config problem(s).`);
  process.exit(1);
}
console.log("validate-manifests: OK (3 manifests and hook config valid)");
