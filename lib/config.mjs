// Store discovery and config resolution.
// Order: QUEST_DIR env (points at a .quests dir) → nearest `.quests/` walking
// up from cwd. QUEST_BACKEND env overrides the backend only. No store → the
// caller exits 3 (every command except `init`).

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export class ConfigError extends Error {
  constructor(message, { hint } = {}) {
    super(message);
    this.hint = hint;
  }
}

export const BUILTIN_DEFAULTS = {
  worker: "claude",
  claude: { model: "opus", effort: "xhigh" },
  codex: { model: "gpt-5-codex", reasoning_effort: "medium" },
  max_iterations: 8,
  priority: "p2",
};

export function findStoreDir(cwd = process.cwd(), env = process.env) {
  if (env.QUEST_DIR) {
    const dir = resolve(env.QUEST_DIR);
    if (!existsSync(join(dir, "config.json"))) {
      throw new ConfigError(`QUEST_DIR points at "${dir}" but no config.json exists there`, { hint: "unset QUEST_DIR or run `quest init` in that directory's parent" });
    }
    return dir;
  }
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, ".quests");
    if (existsSync(join(candidate, "config.json")) && statSync(candidate).isDirectory()) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(storeDir, env = process.env) {
  const path = join(storeDir, "config.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ConfigError(`invalid ${path}: ${err.message}`, { hint: "fix the JSON by hand or re-run `quest init`" });
  }
  const backend = env.QUEST_BACKEND || raw.backend;
  if (!["local", "github"].includes(backend)) {
    throw new ConfigError(`backend must be "local" or "github" (got "${backend}")`, { hint: `edit ${path}` });
  }
  if (backend === "github" && !raw.github?.repo) {
    throw new ConfigError('backend is "github" but github.repo is not set', { hint: `add {"github": {"repo": "owner/name"}} to ${path}` });
  }
  const defaults = {
    ...BUILTIN_DEFAULTS,
    ...raw.defaults,
    claude: { ...BUILTIN_DEFAULTS.claude, ...raw.defaults?.claude },
    codex: { ...BUILTIN_DEFAULTS.codex, ...raw.defaults?.codex },
  };
  return { storeDir, path, backend, github: raw.github ?? {}, defaults, notify: raw.notify ?? { command: "" } };
}
