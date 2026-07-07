import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run as questRun } from "../lib/cli.mjs";
import { run as runnerRun } from "../lib/runner.mjs";
import * as local from "../lib/store-local.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIMS = join(HERE, "shims");
const QUEST_BIN = join(HERE, "..", "bin", "quest");

let repo, storeDir, baseEnv, scenarioPath;

const silent = { stdout() {}, stderr() {} };

beforeEach(async () => {
  repo = mkdtempSync(join(tmpdir(), "quest-run-"));
  storeDir = join(repo, ".quests");
  scenarioPath = join(repo, "scenario.json");
  baseEnv = { PATH: `${SHIMS}:${process.env.PATH}` };
  const io = { cwd: repo, env: baseEnv, ...silent };
  await questRun(["init"], io);
});

async function createQuest(worker = "claude", extra = [], title = "Demo") {
  await questRun(
    [
      "create",
      "--title",
      title,
      "--objective",
      "Prove the runner drives a worker.",
      "--done-when",
      "the runner records a checkpoint",
      "--validation",
      "node --test",
      "--worker",
      worker,
      ...extra,
    ],
    { cwd: repo, env: baseEnv, ...silent },
  );
}

function gitInit() {
  spawnSync("git", ["init", "-q"], { cwd: repo });
  spawnSync("git", ["config", "user.email", "t@t.t"], { cwd: repo });
  spawnSync("git", ["config", "user.name", "t"], { cwd: repo });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init", "-q"], { cwd: repo });
}

function writeScenario(obj) {
  writeFileSync(scenarioPath, JSON.stringify({ questBin: QUEST_BIN, questDir: storeDir, questId: 1, ...obj }));
}

function runnerIo() {
  const out = [];
  const err = [];
  const io = {
    cwd: repo,
    env: { ...baseEnv, QUEST_SHIM_SCENARIO: scenarioPath },
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  };
  return { out, err, io };
}

function runsEvents() {
  return local.readRuns(storeDir);
}

function recordText() {
  return local.loadQuest(storeDir, 1).text;
}

test("happy path: shim records complete → exit 0 + full journal", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["complete"], cost_usd: 0.05 });
  const { io } = runnerIo();

  const code = await runnerRun(["1"], io);
  assert.equal(code, 0);

  const q = local.loadQuest(storeDir, 1);
  assert.equal(q.front.status, "complete");

  const events = runsEvents();
  assert.equal(events.filter((e) => e.event === "run_started").length, 1);
  assert.equal(events.filter((e) => e.event === "iteration_finished").length, 1);
  assert.equal(events.filter((e) => e.event === "run_ended").length, 1);
  const iter = events.find((e) => e.event === "iteration_finished");
  assert.equal(iter.status_after, "complete");
  assert.equal(iter.cost_usd, 0.05);
  const ended = events.find((e) => e.event === "run_ended");
  assert.equal(ended.final_status, "complete");
  assert.equal(ended.iterations, 1);
});

test("stall: 2 sessions without a checkpoint → runner-recorded blocked, exit 10", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["nothing", "nothing", "nothing"] });
  const { io } = runnerIo();

  const code = await runnerRun(["1"], io);
  assert.equal(code, 10);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "blocked");
  assert.match(recordText(), /2 consecutive sessions ended without a checkpoint/);
  assert.match(recordText(), /runner stall enforcement/);
});

test("iteration budget: exceeding --max-iterations → blocked, exit 11", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["nothing"] });
  const { io } = runnerIo();

  const code = await runnerRun(["1", "--max-iterations", "1"], io);
  assert.equal(code, 11);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "blocked");
  assert.match(recordText(), /iteration budget exhausted/);
});

test("token budget: exceeding --max-tokens → blocked, exit 11 (governs codex-style spend)", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["nothing"] });
  const { io } = runnerIo();

  const code = await runnerRun(["1", "--max-tokens", "1"], io);
  assert.equal(code, 11);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "blocked");
  assert.match(recordText(), /token budget exhausted/);
});

test("notify runs with env vars on run end (asserted via a written file)", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["complete"], cost_usd: 0.05 });
  const notifyFile = join(repo, "notify.out");
  const { io } = runnerIo();

  const code = await runnerRun(
    ["1", "--notify", `printf '%s|%s|%s|%s|%s' "$QUEST_ID" "$QUEST_TITLE" "$FINAL_STATUS" "$ITERATIONS" "$COST" > ${notifyFile}`],
    io,
  );
  assert.equal(code, 0);
  assert.ok(existsSync(notifyFile), "notify command should have written its file");
  assert.equal(readFileSync(notifyFile, "utf8"), "1|Demo|complete|1|0.05");
});

test("notify failure is isolated — warns but never changes the exit code", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["complete"], cost_usd: 0.05 });
  const { io, err } = runnerIo();

  const code = await runnerRun(["1", "--notify", "exit 7"], io);
  assert.equal(code, 0, "a failing notify must not change the run's exit code");
  assert.match(err.join("\n"), /notify command failed/);
});

test("codex: narrated create_goal triggers exactly one corrective resume", async () => {
  await createQuest("codex");
  writeScenario({
    initial: { createGoal: false },
    resume: { createGoal: true, checkpoint: "complete" },
    thread_id: "th-xyz",
  });
  const { io } = runnerIo();

  const code = await runnerRun(["1"], io);
  assert.equal(code, 0);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "complete");

  const calls = readFileSync(scenarioPath + ".codex.calls.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(calls.length, 2, "codex should be called twice: initial + one corrective resume");
  assert.equal(calls[0].isResume, false);
  assert.equal(calls[1].isResume, true);
  assert.match(calls[1].argv.join(" "), /narrated it instead/);
  assert.match(calls[1].argv.join(" "), /create_goal tool now/);
});

test("--dry-run prints the invocation and spawns nothing", async () => {
  await createQuest("claude");
  writeScenario({ sessions: ["complete"] });
  const { io, out } = runnerIo();

  const code = await runnerRun(["1", "--dry-run"], io);
  assert.equal(code, 0);
  const text = out.join("\n");
  assert.match(text, /claude/);
  assert.match(text, /\/goal/);
  assert.match(text, /--plugin-dir/);
  // Nothing spawned: quest stays todo, no journal, no shim call log.
  assert.equal(local.loadQuest(storeDir, 1).front.status, "todo");
  assert.ok(!existsSync(join(storeDir, "runs.ndjson")), "dry-run must not journal");
  assert.ok(!existsSync(scenarioPath + ".claude.calls.jsonl"), "dry-run must not spawn the worker");
});

test("--dry-run --json emits the invocation as JSON", async () => {
  await createQuest("claude");
  const { io, out } = runnerIo();
  const code = await runnerRun(["1", "--dry-run", "--json"], io);
  assert.equal(code, 0);
  const obj = JSON.parse(out[0]);
  assert.equal(obj.dry_run, true);
  assert.equal(obj.worker, "claude");
  assert.equal(obj.cmd, "claude");
  assert.ok(obj.args.includes("--plugin-dir"));
  assert.match(obj.prompt, /^\/goal /);
});

test("in_progress checkpoint resets the stall counter (progress keeps iterating)", async () => {
  await createQuest("claude");
  // session 0 makes progress (checkpoint in_progress), sessions 1 & 2 stall.
  writeScenario({ sessions: ["in_progress", "nothing", "nothing"] });
  const { io } = runnerIo();
  const code = await runnerRun(["1"], io);
  assert.equal(code, 10);
  // Three sessions ran (progress reset the stall after session 0).
  const ended = runsEvents().find((e) => e.event === "run_ended");
  assert.equal(ended.iterations, 3);
});

test("resolution: --worker flag overrides the record frontmatter", async () => {
  await createQuest("claude");
  const { io, out } = runnerIo();
  const code = await runnerRun(["1", "--worker", "codex", "--dry-run", "--json"], io);
  assert.equal(code, 0);
  assert.equal(JSON.parse(out[0]).worker, "codex");
});

test("--ready runs every ready quest to completion", async () => {
  await createQuest("claude", [], "Alpha");
  await createQuest("claude", [], "Beta");
  writeScenario({ sessions: ["complete", "complete"], questId: 0 });
  const { io } = runnerIo();

  const code = await runnerRun(["--ready"], io);
  assert.equal(code, 0);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "complete");
  assert.equal(local.loadQuest(storeDir, 2).front.status, "complete");
  const ended = runsEvents().filter((e) => e.event === "run_ended");
  assert.equal(ended.length, 2);
});

test("--ready --parallel promotes a quest whose dependency just completed", async () => {
  await createQuest("claude", [], "First");
  await createQuest("claude", ["--depends-on", "1"], "Second");
  // Quest 2 is not ready until quest 1 completes.
  assert.equal((await import("../lib/store-local.mjs")).readyQuests(storeDir).map((q) => q.id).join(","), "1");
  writeScenario({ sessions: ["complete", "complete"], questId: 0 });
  const { io } = runnerIo();

  const code = await runnerRun(["--ready", "--parallel", "2"], io);
  assert.equal(code, 0);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "complete");
  assert.equal(local.loadQuest(storeDir, 2).front.status, "complete", "quest 2 should have been promoted after 1 completed");
});

test("--isolate worktree gives the quest a git worktree + quest/<id>-<slug> branch", async () => {
  gitInit();
  await createQuest("claude", [], "Widget");
  writeScenario({ sessions: ["complete"], questId: 0 });
  const { io } = runnerIo();

  const code = await runnerRun(["--ready", "--isolate", "worktree"], io);
  assert.equal(code, 0);
  const wt = join(repo, ".quests-wt", "1-widget");
  assert.ok(existsSync(wt), "worktree directory should exist and be left in place");
  const branches = spawnSync("git", ["branch", "--list", "quest/1-widget"], { cwd: repo, encoding: "utf8" }).stdout;
  assert.match(branches, /quest\/1-widget/);
  assert.equal(local.loadQuest(storeDir, 1).front.status, "complete");
});
