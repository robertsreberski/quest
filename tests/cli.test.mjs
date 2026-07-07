import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../lib/cli.mjs";

const SNAP = new URL("./snapshots/", import.meta.url).pathname;

let cwd, out, err, io;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "quest-cli-"));
  out = [];
  err = [];
  io = { cwd, env: {}, stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
});

const CREATE = ["create", "--title", "Demo quest", "--objective", "Prove the CLI works.", "--done-when", "lifecycle test passes", "--validation", "npm test"];

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

test("github backend is honestly unavailable (exit 6)", async () => {
  await run(["init"], io);
  const cfg = join(cwd, ".quests", "config.json");
  writeFileSync(cfg, JSON.stringify({ backend: "github", github: { repo: "o/r" } }));
  assert.equal(await run(["list"], io), 6);
  assert.match(err.join("\n"), /github backend/);
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
