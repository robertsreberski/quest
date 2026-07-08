import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { run } from "../lib/cli.mjs";

const SNAP = new URL("./snapshots/", import.meta.url).pathname;
const SHIMS = new URL("./shims/", import.meta.url).pathname;

let cwd, out, err, io;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "quest-cli-"));
  out = [];
  err = [];
  io = { cwd, env: {}, stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
});

const CREATE = ["create", "--title", "Demo quest", "--objective", "Prove the CLI works.", "--done-when", "lifecycle test passes", "--validation", "npm test"];

function writeQuestShim(dir, version) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "quest");
  writeFileSync(path, `#!/usr/bin/env sh\necho ${version}\n`);
  chmodSync(path, 0o755);
  return dir;
}

function snap(name) {
  return readFileSync(join(SNAP, name), "utf8").trimEnd();
}

test("bare quest without a store guides to init (snapshot)", async () => {
  assert.equal(await run([], io), 0);
  assert.equal(out.join("\n"), snap("no-store.txt"));
});

test("help snapshots: general, create, checkpoint", async () => {
  assert.equal(await run(["help"], io), 0);
  assert.equal(out.join("\n"), snap("help-general.txt"));
  out.length = 0;
  assert.equal(await run(["create", "--help"], io), 0);
  assert.equal(out.join("\n"), snap("help-create.txt"));
  out.length = 0;
  assert.equal(await run(["checkpoint", "--help"], io), 0);
  assert.equal(out.join("\n"), snap("help-checkpoint.txt"));
});

test("unknown command exits 2 with a hint", async () => {
  assert.equal(await run(["frobnicate"], io), 2);
  assert.match(err.join("\n"), /unknown command/);
  assert.match(err.join("\n"), /hint:/);
});

test("--version reports the package version", async () => {
  assert.equal(await run(["--version"], io), 0);
  assert.equal(out[0], "0.3.2");
});

test("codex install-agents installs native project agents idempotently", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project", "--dry-run", "--json"], io), 0);
  let result = JSON.parse(out[0]);
  assert.equal(result.dry_run, true);
  assert.equal(result.actions.length, 2);
  assert.ok(result.actions.every((a) => a.action === "create"));
  assert.equal(existsSync(join(cwd, ".codex", "agents", "quest-executor.toml")), false);

  out.length = 0;
  assert.equal(await run(["codex", "install-agents", "--scope", "project", "--json"], io), 0);
  result = JSON.parse(out[0]);
  assert.equal(result.ok, true);
  const executor = join(cwd, ".codex", "agents", "quest-executor.toml");
  const reviewer = join(cwd, ".codex", "agents", "quest-reviewer.toml");
  assert.ok(existsSync(executor));
  assert.ok(existsSync(reviewer));
  assert.match(readFileSync(executor, "utf8"), /name = "quest-executor"/);

  out.length = 0;
  assert.equal(await run(["codex", "install-agents", "--scope", "project", "--json"], io), 0);
  result = JSON.parse(out[0]);
  assert.ok(result.actions.every((a) => a.action === "unchanged"));

  writeFileSync(reviewer, "name = \"custom-reviewer\"\n");
  err.length = 0;
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 2);
  assert.match(err.join("\n"), /--force/);
});

test("codex install-agents --dry-run previews a conflict instead of erroring", async () => {
  await run(["codex", "install-agents", "--scope", "project"], io);
  const reviewer = join(cwd, ".codex", "agents", "quest-reviewer.toml");
  writeFileSync(reviewer, "name = \"custom-reviewer\"\n");

  out.length = 0;
  err.length = 0;
  assert.equal(await run(["codex", "install-agents", "--scope", "project", "--dry-run", "--json"], io), 0);
  const result = JSON.parse(out[0]);
  assert.equal(result.ok, false);
  assert.equal(result.dry_run, true);
  assert.ok(result.actions.some((a) => a.action === "conflict"));
  // The preview must not touch disk — the custom file is intact.
  assert.equal(readFileSync(reviewer, "utf8"), "name = \"custom-reviewer\"\n");
});

test("codex install-agents is atomic — a later conflict writes no earlier agent", async () => {
  // Only the reviewer exists (customized); the executor is absent. A no-force run
  // must refuse the whole set, not create the executor before hitting the conflict.
  const agentsDir = join(cwd, ".codex", "agents");
  const reviewer = join(agentsDir, "quest-reviewer.toml");
  const executor = join(agentsDir, "quest-executor.toml");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(reviewer, "name = \"custom-reviewer\"\n");
  err.length = 0;
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 2);
  assert.equal(existsSync(executor), false, "executor must not be partially installed");
  assert.equal(readFileSync(reviewer, "utf8"), "name = \"custom-reviewer\"\n");
});

test("codex doctor verifies CLI/plugin/hooks/skills/agents from native surfaces", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const codexIo = { ...io, env: { PATH: `${SHIMS}${delimiter}${process.env.PATH}` } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 0);
  const result = JSON.parse(out[0]);
  assert.equal(result.ok, true);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["version-sync"].ok, true);
  assert.equal(byName["quest-cli-path"].ok, true);
  assert.equal(byName["plugin-installed"].ok, true);
  assert.equal(byName["plugin-version"].ok, true);
  assert.equal(byName["multi-agent-feature"].ok, true);
  assert.match(byName["multi-agent-feature"].detail, /native Codex quest-executor dispatch available/);
  assert.equal(byName["goals-feature"].ok, true);
  assert.match(byName["goals-feature"].detail, /create_goal\/get_goal/);
  assert.equal(byName["single-neutral-skill-root"].ok, true);
  assert.equal(byName["native-agents"].ok, true);
});

test("codex doctor fails when quest on PATH is stale", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const staleDir = writeQuestShim(join(cwd, "stale-bin"), "0.3.0");
  const codexIo = { ...io, env: { PATH: `${staleDir}${delimiter}${SHIMS}${delimiter}${process.env.PATH}` } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 1);
  const result = JSON.parse(out[0]);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["quest-cli-path"].ok, false);
  assert.match(byName["quest-cli-path"].detail, /quest on PATH=0\.3\.0, package=0\.3\.2/);
  assert.match(byName["quest-cli-path"].detail, /npm install -g quest-loop@0\.3\.2/);
});

test("codex doctor fails with upgrade hint when installed plugin is stale", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const codexIo = { ...io, env: { PATH: `${SHIMS}${delimiter}${process.env.PATH}`, QUEST_SHIM_PLUGIN_VERSION: "0.3.0" } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 1);
  const result = JSON.parse(out[0]);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["plugin-version"].ok, false);
  assert.match(byName["plugin-version"].detail, /installed=0\.3\.0, manifest=0\.3\.2/);
  assert.match(byName["plugin-version"].detail, /codex plugin marketplace upgrade quest/);
});

test("codex doctor fails when prompt-input exposes duplicate quest skill roots", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const codexIo = { ...io, env: { PATH: `${SHIMS}${delimiter}${process.env.PATH}`, QUEST_SHIM_DUPLICATE_SKILL_ROOTS: "true" } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 1);
  const result = JSON.parse(out[0]);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["single-neutral-skill-root"].ok, false);
  assert.deepEqual(byName["single-neutral-skill-root"].duplicate_skills, ["orchestrate", "plan", "protocol", "retro", "work"]);
  assert.equal(byName["single-neutral-skill-root"].skill_roots.length, 2);
  assert.match(byName["single-neutral-skill-root"].detail, /duplicate skill names/);
});

test("codex doctor reports quest-run fallback when Codex multi_agent is disabled", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const codexIo = { ...io, env: { PATH: `${SHIMS}${delimiter}${process.env.PATH}`, QUEST_SHIM_MULTI_AGENT: "false" } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 1);
  const result = JSON.parse(out[0]);
  assert.equal(result.ok, false);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["multi-agent-feature"].ok, false);
  assert.match(byName["multi-agent-feature"].detail, /use quest-run fallback/);
  assert.equal(byName["goals-feature"].ok, true);
});

test("codex doctor fails when Codex goals are disabled even if multi_agent is enabled", async () => {
  assert.equal(await run(["codex", "install-agents", "--scope", "project"], io), 0);
  out.length = 0;
  const codexIo = { ...io, env: { PATH: `${SHIMS}${delimiter}${process.env.PATH}`, QUEST_SHIM_GOALS: "false" } };
  assert.equal(await run(["codex", "doctor", "--json"], codexIo), 1);
  const result = JSON.parse(out[0]);
  assert.equal(result.ok, false);
  const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
  assert.equal(byName["multi-agent-feature"].ok, true);
  assert.equal(byName["goals-feature"].ok, false);
  assert.match(byName["goals-feature"].detail, /requires create_goal\/get_goal/);
});

test("commands without a store exit 3 with init hint", async () => {
  assert.equal(await run(["list"], io), 3);
  assert.match(err.join("\n"), /no quest store found/);
  assert.match(err.join("\n"), /quest init/);
});

test("full lifecycle through the CLI, with --json shapes", async () => {
  assert.equal(await run(["init"], io), 0);
  assert.match(out.join("\n"), /Store created/);

  out.length = 0;
  assert.equal(await run([...CREATE, "--json"], io), 0);
  const created = JSON.parse(out[0]);
  assert.equal(created.id, 1);

  out.length = 0;
  assert.equal(await run(["show", "1", "--json"], io), 0);
  const shown = JSON.parse(out[0]);
  assert.equal(shown.status, "todo");
  assert.equal(shown.worker, "claude");
  assert.deepEqual(shown.checkpoints, []);

  assert.equal(await run(["start", "1"], io), 0);
  out.length = 0;
  assert.equal(await run(["checkpoint", "1", "--status", "complete", "--summary", "did it", "--validation", "`npm test` → green", "--json"], io), 0);
  assert.equal(JSON.parse(out[0]).status, "complete");

  out.length = 0;
  assert.equal(await run(["list", "--status", "complete", "--json"], io), 0);
  assert.equal(JSON.parse(out[0]).length, 1);

  assert.equal(await run(["lint", "--all"], io), 0);
});

test("bare quest with a store shows the overview", async () => {
  await run(["init"], io);
  await run(CREATE, io);
  out.length = 0;
  assert.equal(await run([], io), 0);
  const text = out.join("\n");
  assert.match(text, /1 todo/);
  assert.match(text, /Ready to work/);
  assert.match(text, /Demo quest/);
});

test("unknown quest id exits 4", async () => {
  await run(["init"], io);
  assert.equal(await run(["show", "9"], io), 4);
  assert.match(err.join("\n"), /not found/);
});

test("illegal transition exits 5 with precise message", async () => {
  await run(["init"], io);
  await run(CREATE, io);
  assert.equal(await run(["checkpoint", "1", "--status", "complete", "--summary", "x", "--validation", "`y`"], io), 5);
  assert.match(err.join("\n"), /illegal status transition: todo → complete/);
});

test("checkpoint without required flags exits 2", async () => {
  await run(["init"], io);
  await run(CREATE, io);
  await run(["start", "1"], io);
  assert.equal(await run(["checkpoint", "1", "--status", "in_progress", "--summary", "x"], io), 2);
  assert.match(err.join("\n"), /--validation is required/);
});

test("create without done-when exits 2", async () => {
  await run(["init"], io);
  assert.equal(await run(["create", "--title", "t", "--objective", "o", "--validation", "v"], io), 2);
  assert.match(err.join("\n"), /--done-when/);
});

test("github backend surfaces gh unavailability as exit 6 (never falls back to local)", async () => {
  await run(["init"], io);
  const cfg = join(cwd, ".quests", "config.json");
  writeFileSync(cfg, JSON.stringify({ backend: "github", github: { repo: "o/r" } }));
  // No gh on PATH → the store must fail honestly (exit 6), not silently read local.
  const badIo = { ...io, env: { PATH: "/nonexistent-quest-test-bin" } };
  assert.equal(await run(["list"], badIo), 6);
  assert.match(err.join("\n"), /gh/);
});

test("init --agents-md appends orientation section", async () => {
  writeFileSync(join(cwd, "AGENTS.md"), "# Repo\n");
  assert.equal(await run(["init", "--agents-md"], io), 0);
  const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /## Quest goal-loop/);
  assert.match(agents, /quest checkpoint/);
});

test("edit requires rationale and records expansion", async () => {
  await run(["init"], io);
  await run(CREATE, io);
  assert.equal(await run(["edit", "1", "--add-done-when", "extra"], io), 5);
  err.length = 0;
  assert.equal(await run(["edit", "1", "--add-done-when", "extra", "--rationale", "same objective"], io), 0);
  out.length = 0;
  await run(["show", "1"], io);
  assert.match(out.join("\n"), /- \[ \] extra/);
});

test("reopen without --reason exits 5; with a reason flips complete → in_progress", async () => {
  await run(["init"], io);
  await run(CREATE, io);
  await run(["start", "1"], io);
  await run(["checkpoint", "1", "--status", "complete", "--summary", "done", "--validation", "`npm test` → green"], io);

  // Missing reason is a contract violation (exit 5), not a usage error.
  assert.equal(await run(["reopen", "1"], io), 5);
  assert.match(err.join("\n"), /reason/);
  // Still complete — nothing changed.
  out.length = 0;
  await run(["show", "1", "--json"], io);
  assert.equal(JSON.parse(out[0]).status, "complete");

  err.length = 0;
  out.length = 0;
  assert.equal(await run(["reopen", "1", "--reason", "review found criticals", "--json"], io), 0);
  assert.equal(JSON.parse(out[0]).status, "in_progress");
  out.length = 0;
  await run(["show", "1", "--json"], io);
  const shown = JSON.parse(out[0]);
  assert.equal(shown.status, "in_progress");
  assert.equal(shown.checkpoints.at(-1).fields.reopen_reason, "review found criticals");
  // Reopened quests do not re-enter --ready (status in_progress, not todo).
  out.length = 0;
  await run(["list", "--ready", "--json"], io);
  assert.deepEqual(JSON.parse(out[0]), []);
  assert.equal(await run(["lint", "--all"], io), 0);
});

test("reopening a child of a complete parent epic warns on stderr; a non-complete parent stays silent", async () => {
  await run(["init"], io);

  // Case 1: child of a COMPLETE parent epic → reopen succeeds AND warns.
  await run([...CREATE, "--title", "Epic A"], io); // 1
  await run([...CREATE, "--title", "Child A", "--parent", "1"], io); // 2
  await run(["start", "1"], io);
  await run(["checkpoint", "1", "--status", "complete", "--summary", "epic done", "--validation", "`npm test` → green"], io);
  await run(["start", "2"], io);
  await run(["checkpoint", "2", "--status", "complete", "--summary", "child done", "--validation", "`npm test` → green"], io);

  err.length = 0;
  assert.equal(await run(["reopen", "2", "--reason", "review found a defect"], io), 0);
  const warn = err.join("\n");
  assert.match(warn, /parent epic 1 is complete/);
  assert.match(warn, /falsif/i);

  // Case 2: child of a NON-complete parent epic → reopen succeeds, no warning.
  await run([...CREATE, "--title", "Epic B"], io); // 3 (stays todo)
  await run([...CREATE, "--title", "Child B", "--parent", "3"], io); // 4
  await run(["start", "4"], io);
  await run(["checkpoint", "4", "--status", "complete", "--summary", "child done", "--validation", "`npm test` → green"], io);

  err.length = 0;
  assert.equal(await run(["reopen", "4", "--reason", "another defect"], io), 0);
  assert.equal(err.join("\n"), "", "no epic-falsification warning when the parent epic is not complete");
});

test("amend numbers amendments and protocol prints them", async () => {
  await run(["init"], io);
  assert.equal(await run(["amend", "--text", "Cite evidence in every ruling."], io), 0);
  assert.match(out.join("\n"), /Amendment 1/);
  out.length = 0;
  assert.equal(await run(["protocol"], io), 0);
  const text = out.join("\n");
  assert.match(text, /The quest loop protocol/);
  assert.match(text, /Cite evidence in every ruling/);
});

test("runs reports empty then aggregates events", async () => {
  await run(["init"], io);
  assert.equal(await run(["runs"], io), 0);
  assert.match(out.join("\n"), /No recorded runs/);
  const runsFile = join(cwd, ".quests", "runs.ndjson");
  writeFileSync(runsFile, [
    JSON.stringify({ event: "run_started", run_id: "r1", quest: 1, worker: "codex", ts: "t0" }),
    JSON.stringify({ event: "iteration_finished", run_id: "r1", quest: 1, cost_usd: 0.5, ts: "t1" }),
  ].join("\n") + "\n");
  out.length = 0;
  assert.equal(await run(["runs", "--active", "--json"], io), 0);
  const runs = JSON.parse(out[0]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].iterations, 1);
});
