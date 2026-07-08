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
const SKILL_PROSE_TRANSCRIPT = new URL("./fixtures/skill-prose-transcript.jsonl", import.meta.url).pathname;
const MULTI_INVOCATION_TRANSCRIPT = new URL("./fixtures/multi-invocation-transcript.jsonl", import.meta.url).pathname;
const READONLY_REVIEWER_TRANSCRIPT = new URL("./fixtures/readonly-reviewer-transcript.jsonl", import.meta.url).pathname;
const CHECKPOINT_FIRST_TRANSCRIPT = new URL("./fixtures/checkpoint-first-transcript.jsonl", import.meta.url).pathname;
const CODEX_COMMAND_TRANSCRIPT = new URL("./fixtures/codex-command-execution-transcript.jsonl", import.meta.url).pathname;
const CODEX_GREP_TRANSCRIPT = new URL("./fixtures/codex-grep-false-positive-transcript.jsonl", import.meta.url).pathname;
const CODEX_MSG_WRAPPED_TRANSCRIPT = new URL("./fixtures/codex-msg-wrapped-transcript.jsonl", import.meta.url).pathname;

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

// (b'') REGRESSION (quest 15/17 prose false positive, re-anchored on mutating
// verbs): skill-text examples for the *mutating* verbs (`quest start 12` and
// `quest checkpoint 12`) appear in user prose, an assistant text block, and an
// echoed SKILL.md tool_result — all before the real `quest start 1` command
// invocation. The hook must key on the real id (1), never the prose id (12). Prose
// can never key detection: only tool_use command inputs count.
test("SubagentStop: skill-text mutating-verb example never keys detection (prose regression)", async () => {
  await seedQuest(); // quest 1, in_progress, zero checkpoints
  const res = fire(SUBAGENT_STOP, stopPayload(SKILL_PROSE_TRANSCRIPT));
  assert.equal(res.status, 0);
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)",
    "must key the real invocation (quest 1), never the skill-text example (quest 12)",
  );
});

// Determinism: with multiple real mutating invocations, the FIRST one wins. The
// transcript reads quest 2 (show), then really starts quest 2, then checkpoints
// quest 1 — after skill prose citing quest 12. The block must name quest 2: the
// first mutating verb (`quest start 2`) wins over the later `quest checkpoint 1`
// call, the read-only `quest show 2` call, and the quest 12 prose.
test("SubagentStop: first mutating invocation wins (deterministic)", async () => {
  await run(["init"], io);
  await run(["create", "--title", "One", "--objective", "o", "--done-when", "w", "--validation", "node --test"], io);
  await run(["create", "--title", "Two", "--objective", "o", "--done-when", "w", "--validation", "node --test"], io);
  const res = fire(SUBAGENT_STOP, stopPayload(MULTI_INVOCATION_TRANSCRIPT));
  assert.equal(res.status, 0);
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 2: record a checkpoint via `quest checkpoint 2` before stopping (protocol: no stop without a checkpoint)",
    "the first mutating invocation (quest 2 start) wins over the later quest 1 checkpoint and the quest 12 prose",
  );
});

// REGRESSION (quest 16 reviewer false positive): a read-only reviewer inspects the
// quest under review and its dependencies with `quest show <id> --json`, plus
// `quest list --ready` and `quest protocol` — all read verbs, no mutating verb. It
// never owned a quest, so it must be allowed silently even though quest 1 is
// terminal-complete with its last checkpoint older than this run (neither clear
// condition would fire). Under the old show-based marker this blocked the reviewer.
test("SubagentStop: read-only reviewer (show/list/protocol only) is allowed silently (quest 16 regression)", async () => {
  await seedQuest("Ship the widget"); // quest 1, in_progress
  // Terminal-complete, with its only checkpoint recorded now (well before the
  // reviewer's 2099 start) — so neither the checkpoint-newer-than-start nor the
  // terminal-during-run clear would fire. Exactly the quest 16 conditions.
  await run(["checkpoint", "1", "--status", "complete", "--summary", "done", "--validation", "`x` ok"], io);
  const res = fire(SUBAGENT_STOP, { ...stopPayload(READONLY_REVIEWER_TRANSCRIPT), started_at: "2099-01-01T00:00:00Z" });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "", "a read-only reviewer must never be blocked");
});

// The FIRST mutating verb on a resumed/blocked quest may be `quest checkpoint <id>`
// with no preceding `quest start` (already-in_progress quests skip start), so a
// checkpoint invocation must also key executor detection. Here the checkpoint
// attempt did not persist (store has no fresh checkpoint), so the executor that
// stopped without a recorded checkpoint is still blocked — keyed to quest 1 via the
// checkpoint invocation alone.
test("SubagentStop: a checkpoint invocation alone keys executor detection (resumed quest)", async () => {
  await seedQuest(); // quest 1, in_progress, zero checkpoints
  const res = fire(SUBAGENT_STOP, stopPayload(CHECKPOINT_FIRST_TRANSCRIPT));
  assert.equal(res.status, 0);
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)",
    "the `quest checkpoint 1` invocation keys detection even without a `quest start`",
  );
});

test("SubagentStop: Codex command_execution entries key executor detection", async () => {
  await seedQuest(); // quest 1, in_progress, zero checkpoints
  const res = fire(SUBAGENT_STOP, stopPayload(CODEX_COMMAND_TRANSCRIPT));
  assert.equal(res.status, 0);
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)",
  );
});

test("SubagentStop: msg-wrapped Codex command_execution keys executor detection", async () => {
  await seedQuest(); // quest 1, in_progress, zero checkpoints
  const res = fire(SUBAGENT_STOP, stopPayload(CODEX_MSG_WRAPPED_TRANSCRIPT));
  assert.equal(res.status, 0);
  const decision = JSON.parse(res.stdout.trim());
  assert.equal(decision.decision, "block");
  assert.equal(
    decision.reason,
    "quest 1: record a checkpoint via `quest checkpoint 1` before stopping (protocol: no stop without a checkpoint)",
  );
});

test("SubagentStop: a command merely quoting the marker (grep) does not key detection", async () => {
  await seedQuest(); // quest 1, in_progress, zero checkpoints — would block if detected
  const res = fire(SUBAGENT_STOP, stopPayload(CODEX_GREP_TRANSCRIPT));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "", "grep of `quest checkpoint 1` is not a real invocation → allowed silently");
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
