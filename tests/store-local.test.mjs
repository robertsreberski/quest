import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContractError } from "../lib/contract.mjs";
import * as local from "../lib/store-local.mjs";

const DEFAULTS = { worker: "claude", claude: { model: "opus", effort: "xhigh" }, codex: { model: "gpt-5-codex" }, max_iterations: 8, priority: "p2" };
const SECTIONS = { objective: "Do the thing.", doneWhen: ["it works"], validation: "npm test" };

let storeDir;
beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "quest-"));
  storeDir = local.initLocalStore(root);
  writeFileSync(join(storeDir, "config.json"), JSON.stringify({ backend: "local", defaults: DEFAULTS }));
});

test("create assigns sequential ids and canonical filenames", () => {
  const a = local.createQuest(storeDir, DEFAULTS, { title: "First quest" }, SECTIONS);
  const b = local.createQuest(storeDir, DEFAULTS, { title: "Second quest" }, SECTIONS);
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
  assert.ok(a.path.endsWith("001-first-quest.md"));
  assert.equal(a.front.status, "todo");
  assert.equal(a.front.model, "inherit");
});

test("full lifecycle: create → start → checkpoint → complete", () => {
  const { id } = local.createQuest(storeDir, DEFAULTS, { title: "Lifecycle" }, SECTIONS);
  local.startQuest(storeDir, id);
  assert.equal(local.loadQuest(storeDir, id).front.status, "in_progress");

  local.appendCheckpoint(storeDir, id, { quest_status: "in_progress", iteration: 1, changed: "M1 done", validation_summary: "`npm test` → green" });
  const mid = local.loadQuest(storeDir, id);
  assert.equal(mid.checkpoints.length, 1);

  local.appendCheckpoint(storeDir, id, { quest_status: "complete", iteration: 2, changed: "all done", validation_summary: "`npm test` → 10 passed" });
  const done = local.loadQuest(storeDir, id);
  assert.equal(done.front.status, "complete");
  assert.equal(done.checkpoints.length, 2);
  assert.deepEqual(local.lintAll(storeDir).flatMap((r) => r.problems), []);
});

test("checkpoint on a todo quest may move it to in_progress but not complete", () => {
  const { id } = local.createQuest(storeDir, DEFAULTS, { title: "Straight to work" }, SECTIONS);
  assert.throws(() => local.appendCheckpoint(storeDir, id, { quest_status: "complete", iteration: 1, changed: "x", validation_summary: "`y`" }), /illegal/);
  local.appendCheckpoint(storeDir, id, { quest_status: "in_progress", iteration: 1, changed: "x", validation_summary: "started" });
  assert.equal(local.loadQuest(storeDir, id).front.status, "in_progress");
});

test("blocked → in_progress recovery works; complete is terminal", () => {
  const { id } = local.createQuest(storeDir, DEFAULTS, { title: "Blocky" }, SECTIONS);
  local.startQuest(storeDir, id);
  local.appendCheckpoint(storeDir, id, { quest_status: "blocked", iteration: 1, changed: "hit wall", validation_summary: "same error twice" });
  assert.equal(local.loadQuest(storeDir, id).front.status, "blocked");
  local.appendCheckpoint(storeDir, id, { quest_status: "in_progress", iteration: 2, changed: "unblocked", validation_summary: "human ruled" });
  local.appendCheckpoint(storeDir, id, { quest_status: "complete", iteration: 3, changed: "done", validation_summary: "`npm test` green" });
  assert.throws(() => local.appendCheckpoint(storeDir, id, { quest_status: "in_progress", iteration: 4, changed: "more", validation_summary: "x" }), /illegal/);
});

test("ready gating respects depends_on and priority order", () => {
  const a = local.createQuest(storeDir, DEFAULTS, { title: "Dep" }, SECTIONS);
  local.createQuest(storeDir, DEFAULTS, { title: "Gated", depends_on: [a.id], priority: "p0" }, SECTIONS);
  local.createQuest(storeDir, DEFAULTS, { title: "Free low", priority: "p2" }, SECTIONS);
  local.createQuest(storeDir, DEFAULTS, { title: "Free high", priority: "p0" }, SECTIONS);

  let ready = local.readyQuests(storeDir).map((q) => q.title);
  assert.deepEqual(ready, ["Free high", "Dep", "Free low"]);

  local.startQuest(storeDir, a.id);
  local.appendCheckpoint(storeDir, a.id, { quest_status: "complete", iteration: 1, changed: "done", validation_summary: "`ok`" });
  ready = local.readyQuests(storeDir).map((q) => q.title);
  assert.deepEqual(ready, ["Gated", "Free high", "Free low"]); // p0 tie → lower id first
});

test("create rejects unknown depends_on and parent", () => {
  assert.throws(() => local.createQuest(storeDir, DEFAULTS, { title: "Bad dep", depends_on: [99] }, SECTIONS), /unknown quest 99/);
  assert.throws(() => local.createQuest(storeDir, DEFAULTS, { title: "Bad parent", parent: 42 }, SECTIONS), /not found/);
});

test("cancel records reason and is terminal", () => {
  const { id } = local.createQuest(storeDir, DEFAULTS, { title: "Doomed" }, SECTIONS);
  assert.throws(() => local.cancelQuest(storeDir, id, ""), /reason/);
  local.cancelQuest(storeDir, id, "superseded");
  const q = local.loadQuest(storeDir, id);
  assert.equal(q.front.status, "cancelled");
  assert.ok(q.body.includes("superseded"));
  assert.throws(() => local.startQuest(storeDir, id), /illegal/);
});

test("edit appends only additions and records rationale", () => {
  const { id } = local.createQuest(storeDir, DEFAULTS, { title: "Grow" }, SECTIONS);
  assert.throws(() => local.editQuest(storeDir, id, { addDoneWhen: ["more"], rationale: "" }), /rationale/);
  local.editQuest(storeDir, id, { addDoneWhen: ["works on CI"], rationale: "same objective, CI matters" });
  let q = local.loadQuest(storeDir, id);
  assert.ok(q.body.includes("- [ ] works on CI"));
  assert.ok(q.body.includes("same objective, CI matters"));

  local.startQuest(storeDir, id);
  local.editQuest(storeDir, id, { addMilestone: ["M-extra"], rationale: "split late" });
  q = local.loadQuest(storeDir, id);
  assert.equal(q.checkpoints.at(-1).fields.compatible_expansion, "split late");
  assert.equal(q.front.status, "in_progress");
  assert.deepEqual(local.lintAll(storeDir).flatMap((r) => r.problems), []);
});

test("malformed hand-edit fails lint with a precise error", () => {
  const { id, path } = local.createQuest(storeDir, DEFAULTS, { title: "Fragile" }, SECTIONS);
  writeFileSync(path, readFileSync(path, "utf8").replace("status: todo", "status:\n  nested: true"));
  const results = local.lintAll(storeDir);
  assert.equal(results.length, 1);
  assert.match(results[0].problems[0], /no value|key: value/);
  assert.throws(() => local.loadQuest(storeDir, id), ContractError);
});

test("amendments number sequentially", () => {
  writeFileSync(join(storeDir, "amendments.md"), "# Protocol amendments\n\n(none yet)\n");
  const a = local.appendAmendment(storeDir, "First rule.");
  const b = local.appendAmendment(storeDir, "Second rule.");
  assert.equal(a.number, 1);
  assert.equal(b.number, 2);
  const text = readFileSync(join(storeDir, "amendments.md"), "utf8");
  assert.ok(text.includes("## Amendment 1"));
  assert.ok(text.includes("## Amendment 2"));
  assert.ok(!text.includes("(none yet)"));
});

test("run events accumulate and parse", () => {
  local.appendRunEvent(storeDir, { event: "run_started", run_id: "r1", quest: 1, worker: "codex", ts: "t0" });
  local.appendRunEvent(storeDir, { event: "run_ended", run_id: "r1", quest: 1, final_status: "complete", ts: "t1" });
  const runs = local.readRuns(storeDir);
  assert.equal(runs.length, 2);
  assert.equal(runs[1].final_status, "complete");
});
