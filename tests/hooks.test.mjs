// Drives the two plugin hook scripts as child processes with real stdin payloads
// (built to the documented Claude Code hook input schema) against seeded temp
// stores and fixture transcripts. No network; the store is seeded via the CLI's
// own write path so records are contract-valid.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../lib/cli.mjs";

const SESSION_START = new URL("../hooks/session-start.mjs", import.meta.url).pathname;
const SUBAGENT_STOP = new URL("../hooks/subagent-stop.mjs", import.meta.url).pathname;
const EXECUTOR_TRANSCRIPT = new URL("./fixtures/executor-transcript.jsonl", import.meta.url).pathname;
const UNRELATED_TRANSCRIPT = new URL("./fixtures/unrelated-transcript.jsonl", import.meta.url).pathname;

// Clean env: strip QUEST_DIR/QUEST_BACKEND so store discovery is driven purely by
// the payload cwd, matching how the hook runs inside a real session.
const HOOK_ENV = { ...process.env };
delete HOOK_ENV.QUEST_DIR;
delete HOOK_ENV.QUEST_BACKEND;

let cwd, io;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "quest-hooks-"));
  io = { cwd, env: {}, stdout: () => {}, stderr: () => {} };
});

function fire(script, payload) {
  const res = spawnSync("node", [script], { input: JSON.stringify(payload), env: HOOK_ENV, encoding: "utf8" });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

async function seedQuest(title = "Ship the widget", { start = true } = {}) {
  await run(["init"], io);
  await run(["create", "--title", title, "--objective", "Prove it.", "--done-when", "it works", "--validation", "node --test"], io);
  if (start) await run(["start", "1"], io);
}

const stopPayload = (transcript) => ({
  session_id: "s1",
  transcript_path: transcript,
  cwd,
  hook_event_name: "SubagentStop",
  agent_id: "sub-1",
  agent_type: "general-purpose",
});

// (a) executor transcript + a checkpoint newer than the subagent start → allow.
test("SubagentStop: executor with a fresh checkpoint is allowed to stop", async () => {
  await seedQuest();
  await run(["checkpoint", "1", "--status", "in_progress", "--summary", "did work", "--validation", "`node --test` → ok"], io);
  const res = fire(SUBAGENT_STOP, stopPayload(EXECUTOR_TRANSCRIPT));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "", "no block decision should be printed");
});

// (b) executor transcript, no new checkpoint → block with the exact contract.
test("SubagentStop: executor without a new checkpoint is blocked", async () => {
  await seedQuest(); // in_progress, zero checkpoints
  const res = fire(SUBAGENT_STOP, stopPayload(EXECUTOR_TRANSCRIPT));
  assert.equal(res.status, 0, "block uses the JSON-decision path, which exits 0");
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)",
  );
});

// (b') a checkpoint OLDER than the subagent start must not clear the stop.
test("SubagentStop: a stale checkpoint (older than start) still blocks", async () => {
  await seedQuest();
  // Give the quest a checkpoint, but tell the hook the subagent started in 2099,
  // so the checkpoint is "old" relative to this run → must still block.
  await run(["checkpoint", "1", "--status", "in_progress", "--summary", "old", "--validation", "`x` ok"], io);
  const res = fire(SUBAGENT_STOP, { ...stopPayload(EXECUTOR_TRANSCRIPT), started_at: "2099-01-01T00:00:00Z" });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout.trim()).decision, "block");
});

// (c) a subagent whose transcript has no marker is never touched.
test("SubagentStop: an unrelated subagent is allowed silently", async () => {
  await seedQuest();
  const res = fire(SUBAGENT_STOP, stopPayload(UNRELATED_TRANSCRIPT));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

// Conservative: a marker for a quest that does not exist in the store → allow.
test("SubagentStop: marker for an unknown quest allows (no false block)", async () => {
  // store has no quests at all
  await run(["init"], io);
  const res = fire(SUBAGENT_STOP, stopPayload(EXECUTOR_TRANSCRIPT));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

// (d) SessionStart with no store anywhere upward → silent, exit 0.
test("SessionStart: no store is a silent no-op", () => {
  const bare = mkdtempSync(join(tmpdir(), "quest-nostore-"));
  const res = fire(SESSION_START, { session_id: "s1", cwd: bare, hook_event_name: "SessionStart", source: "startup" });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});

// (e) SessionStart with a seeded store → context carries counts + the quest title.
test("SessionStart: seeded store injects counts and the in-flight quest", async () => {
  await seedQuest("Ship the widget");
  const res = fire(SESSION_START, { session_id: "s1", cwd, hook_event_name: "SessionStart", source: "startup" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /in_progress/);
  assert.match(res.stdout, /Ship the widget/);
  assert.match(res.stdout, /quest list --ready/);
});
