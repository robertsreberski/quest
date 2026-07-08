// Codex-native setup helpers. These are intentionally kept out of the quest
// store layer: they inspect/install Codex integration files, not quest records.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = ["quest-executor", "quest-reviewer"];

function readJson(rel) {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, rel), "utf8"));
}

// Like readJson but returns null instead of throwing. The plugin manifests
// (.codex-plugin / .claude-plugin) are NOT part of the npm `files` allow-list,
// so they are absent from a pure `npm install -g quest-loop` install — reading
// them must never crash `quest --version` or `quest codex doctor`.
function readJsonSafe(rel) {
  try {
    return readJson(rel);
  } catch {
    return null;
  }
}

function runCmd(cmd, args, { cwd, env } = {}) {
  return spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function check(name, ok, detail, extra = {}) {
  return { name, ok: Boolean(ok), detail, ...extra };
}

function projectRoot(cwd, env) {
  const res = runCmd("git", ["rev-parse", "--show-toplevel"], { cwd, env });
  if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
  return resolve(cwd);
}

function targetDir(scope, cwd, env) {
  if (scope === "user") return join(homedir(), ".codex", "agents");
  if (scope === "project") return join(projectRoot(cwd, env), ".codex", "agents");
  throw new Error(`--scope must be project or user (got "${scope}")`);
}

function installedAgentDirs(cwd, env) {
  return [
    join(projectRoot(cwd, env), ".codex", "agents"),
    join(homedir(), ".codex", "agents"),
  ];
}

function sameFile(path, text) {
  try {
    return readFileSync(path, "utf8") === text;
  } catch {
    return false;
  }
}

function extractTexts(promptInputJson) {
  try {
    const items = JSON.parse(promptInputJson);
    const texts = [];
    const walk = (v) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      if (typeof v.text === "string") texts.push(v.text);
      if (typeof v.content === "string") texts.push(v.content);
      for (const child of Object.values(v)) walk(child);
    };
    walk(items);
    return texts.join("\n");
  } catch {
    return promptInputJson;
  }
}

function questSkillEntries(promptInputJson) {
  const text = extractTexts(promptInputJson);
  const entries = new Map();
  const re = /- quest:(plan|work|orchestrate|retro|protocol|setup):[^\n]+\(file: ([^)]+)\)/g;
  for (const m of text.matchAll(re)) entries.set(m[1], m[2]);
  return [...entries.entries()].map(([name, path]) => ({ name, path })).sort((a, b) => a.name.localeCompare(b.name));
}

function pathRootForQuestSkill(path) {
  // Match POSIX `/skills/` and Windows `\skills\` so the neutral-root check
  // does not falsely split every skill path into its own root on Windows.
  const i = path.search(/[/\\]skills[/\\]/);
  return i === -1 ? path : path.slice(0, i);
}

export function versionInfo() {
  // package.json is always shipped; the plugin manifests may be absent on a
  // CLI-only npm install, so they are read tolerantly.
  const pkg = readJson("package.json");
  const codexManifest = readJsonSafe(".codex-plugin/plugin.json");
  const claudeManifest = readJsonSafe(".claude-plugin/plugin.json");
  return {
    package: pkg.version,
    codex: codexManifest?.version ?? null,
    claude: claudeManifest?.version ?? null,
  };
}

export function installAgents({ scope = "project", dryRun = false, force = false, cwd = process.cwd(), env = process.env } = {}) {
  const dir = targetDir(scope, cwd, env);

  // Plan every agent first; only touch disk once the whole set is known to be
  // conflict-free. A mixed create+conflict run must not leave a partial install.
  const plans = AGENTS.map((name) => {
    const src = join(PLUGIN_ROOT, "agents", `${name}.toml`);
    const dest = join(dir, `${name}.toml`);
    const text = readFileSync(src, "utf8");
    const exists = existsSync(dest);
    let action;
    if (exists && sameFile(dest, text)) action = "unchanged";
    else if (exists && !force) action = "conflict";
    else action = exists ? "replace" : "create";
    return { name, path: dest, action, text };
  });

  const conflicts = plans.filter((p) => p.action === "conflict").map(({ name, path }) => ({ name, path }));
  const actions = plans.map(({ name, path, action }) => ({ name, path, action }));
  const ok = conflicts.length === 0;

  if (ok && !dryRun) {
    for (const p of plans) {
      if (p.action === "unchanged") continue;
      mkdirSync(dir, { recursive: true });
      writeFileSync(p.path, p.text);
    }
  }

  return { ok, scope, target: dir, dry_run: dryRun, actions, conflicts };
}

export function doctor({ cwd = process.cwd(), env = process.env } = {}) {
  const checks = [];
  const versions = versionInfo();
  // package.json ships everywhere; the plugin manifests may be absent on a
  // CLI-only npm install. Treat absent manifests as "not applicable" rather than
  // a hard mismatch, and fall back to the package version as the expected plugin
  // version so a legitimate CLI-only doctor run is not spuriously red.
  const manifestVersion = versions.codex ?? versions.package;
  const presentManifests = [["codex", versions.codex], ["claude", versions.claude]].filter(([, v]) => v != null);
  const absent = ["codex", "claude"].filter((k) => versions[k] == null);

  checks.push(check(
    "version-sync",
    presentManifests.every(([, v]) => v === versions.package),
    `package=${versions.package}, codex=${versions.codex ?? "absent"}, claude=${versions.claude ?? "absent"}` +
      (absent.length ? ` (${absent.join(", ")} manifest absent — CLI-only install)` : ""),
    { versions },
  ));

  const codexVersion = runCmd("codex", ["--version"], { cwd, env });
  checks.push(check(
    "codex-cli",
    codexVersion.status === 0,
    codexVersion.status === 0 ? codexVersion.stdout.trim() : (codexVersion.stderr || codexVersion.error?.message || "codex not found").trim(),
  ));

  if (codexVersion.status === 0) {
    const list = runCmd("codex", ["plugin", "list", "--json"], { cwd, env });
    let installed;
    try {
      const parsed = JSON.parse(list.stdout || "{}");
      installed = (parsed.installed || []).find((p) => p.pluginId === "quest@quest" || (p.name === "quest" && p.marketplaceName === "quest"));
    } catch {
      installed = null;
    }
    checks.push(check(
      "plugin-installed",
      list.status === 0 && installed?.enabled === true,
      installed ? `quest@quest ${installed.version} enabled=${installed.enabled}` : (list.stderr || "quest@quest not installed").trim(),
      { installed: installed ?? null },
    ));
    checks.push(check(
      "plugin-version",
      Boolean(installed && installed.version === manifestVersion),
      installed ? `installed=${installed.version}, manifest=${manifestVersion}` : `manifest=${manifestVersion}`,
    ));

    const debug = runCmd("codex", ["debug", "prompt-input", "noop"], { cwd: tmpdir(), env });
    // Require a hook-parse *problem*, not merely the word "hook" next to "warnings".
    // Matches both orderings ("hook parse warning" / "failed to parse hook") while
    // ignoring benign summaries like "loaded 4 hooks, 0 warnings".
    const hookWarning = /(?:parse|parsing)[^\n]*\bhook\b|\bhook\b[^\n]*(?:parse|parsing|invalid|malformed)|failed to (?:parse|load)[^\n]*\bhook\b/i.test(debug.stderr || "");
    checks.push(check(
      "hook-parser",
      debug.status === 0 && !hookWarning,
      debug.status === 0 ? (hookWarning ? debug.stderr.trim() : "no hook parse warnings") : (debug.stderr || "codex debug failed").trim(),
    ));

    const entries = debug.status === 0 ? questSkillEntries(debug.stdout) : [];
    const requiredSkills = ["plan", "work", "orchestrate", "retro", "protocol"];
    const missingSkills = requiredSkills.filter((name) => !entries.some((entry) => entry.name === name));
    const paths = entries.map((entry) => entry.path);
    const roots = [...new Set(paths.map(pathRootForQuestSkill))];
    checks.push(check(
      "single-neutral-skill-root",
      missingSkills.length === 0 && roots.length === 1,
      paths.length ? `${entries.length} quest skills across ${roots.length} root(s)` : "quest skills not found in neutral prompt-input",
      { skills: entries, missing_skills: missingSkills, skill_paths: paths, skill_roots: roots },
    ));
  }

  const agentDirs = installedAgentDirs(cwd, env);
  const missing = [];
  const stale = [];
  const found = {};
  for (const name of AGENTS) {
    const bundled = readFileSync(join(PLUGIN_ROOT, "agents", `${name}.toml`), "utf8");
    const path = agentDirs.map((dir) => join(dir, `${name}.toml`)).find((p) => existsSync(p));
    if (!path) {
      missing.push(name);
      continue;
    }
    found[name] = path;
    // Existence alone can mask a stale user-scope copy shadowing an out-of-date
    // project install — compare against the bundled definition.
    if (!sameFile(path, bundled)) stale.push(name);
  }
  const agentDetail = [
    missing.length ? `missing: ${missing.join(", ")}` : null,
    stale.length ? `stale (run install-agents --force): ${stale.join(", ")}` : null,
  ].filter(Boolean).join("; ") || `found: ${Object.values(found).join(", ")}`;
  checks.push(check(
    "native-agents",
    missing.length === 0 && stale.length === 0,
    agentDetail,
    { found, missing, stale },
  ));

  return { ok: checks.every((c) => c.ok), checks };
}
