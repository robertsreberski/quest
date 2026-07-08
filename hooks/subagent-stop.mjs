#!/usr/bin/env node
// SubagentStop hook. Blocks a quest-executor subagent that tries to stop without
// recording a checkpoint — the protocol's "no stop without a checkpoint" rule,
// enforced deterministically.
//
// A subagent counts as a quest-executor iff one of its transcript entries records
// an actual *mutating* quest invocation — `quest start <id>` or `quest checkpoint
// <id>` (under any binary prefix: `quest`, `./bin/quest`, `node bin/quest`) — as a
// tool_use block whose shell command carries the marker. Read-only verbs
// (`quest show <id> --json`, `list`, `protocol`, `runs`) are how reviewers and
// orchestrators inspect a quest without owning it, so they must NEVER key
// detection: an agent whose transcript holds only read verbs is allowed silently.
// The executor id comes from that first mutating invocation (deterministic,
// transcript order) — including `quest checkpoint <id>`, because an executor
// resuming an already-in_progress quest skips `quest start` and its first mutating
// verb is the checkpoint. We parse the JSONL per-entry and inspect only tool_use
// command inputs; prose, quoted skill text, examples, and echoed file contents live
// in text blocks and tool_result content (never in a tool_use command), so
// `quest start 12` / `quest checkpoint 12` examples in the skills can no longer key
// detection. No mutating invocation → not our concern, allow silently. We then
// compare the quest's latest checkpoint against the subagent's start time (the
// transcript's first timestamp): a checkpoint newer than start clears the stop; so
// does a terminal store status (complete/blocked/cancelled) reached during the run.
//
// Conservative by construction: any missing/unreadable input or parse failure →
// allow (exit 0), with a one-line stderr diagnostic. We never false-positive-block
// unrelated subagents.
//
// Block contract (Claude Code command hook): print {"decision":"block","reason"}
// to stdout and exit 0. (Note: the {"ok":false,...} shape is for prompt/agent
// hooks, not command hooks — see the checkpoint notes for this quest.)

import { readFileSync, writeSync } from "node:fs";
import { findStoreDir } from "../lib/config.mjs";
import { loadQuest } from "../lib/store-local.mjs";

// Mutating quest verbs only. Group 1 is the verb, group 2 the id. `\bquest`
// anchors on a word boundary so `bin/quest` and `./bin/quest` match while
// `conquest` does not; read verbs (show/list/protocol/runs) are deliberately absent.
const MARKER = /\bquest\s+(start|checkpoint)\s+(\d+)/;
const TERMINAL = ["complete", "blocked", "cancelled"];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function allow() { process.exit(0); }
function diag(msg) { writeSync(2, `quest subagent-stop hook: ${msg}\n`); }
function block(id) {
  const reason = `quest ${id}: record a checkpoint via \`quest checkpoint ${id}\` before stopping (protocol: no stop without a checkpoint)`;
  writeSync(1, JSON.stringify({ decision: "block", reason }) + "\n");
  process.exit(0);
}

function toMs(v) {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

// The subagent's start = the first parseable `timestamp` in the JSONL transcript.
function firstTimestamp(text) {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const ms = obj && typeof obj === "object" ? toMs(obj.timestamp) : null;
    if (ms != null) return ms;
  }
  return null;
}

// A tool_use block's shell command, or null. Bash invocations carry the command
// under `input.command`; only that field is a real command invocation. We never
// scan other input fields (e.g. an Edit's new_string or a Read's file_path), which
// could echo skill text and re-introduce the false positive.
function commandOf(input) {
  return input && typeof input === "object" && typeof input.command === "string" ? input.command : null;
}

// The mutating-verb marker id from one transcript entry, considering only tool_use
// command invocations. Assistant messages carry an array of content blocks; string
// content (plain prose) and tool_result blocks (echoed output/file contents) are
// ignored. Matches `quest start <id>` or `quest checkpoint <id>` and returns the id.
function markerIdInEntry(entry) {
  const item = entry && typeof entry === "object" ? entry.item : null;
  if (item && typeof item === "object" && item.type === "command_execution" && typeof item.command === "string") {
    const m = MARKER.exec(item.command);
    if (m) return Number(m[2]);
  }
  const msgItem = entry && typeof entry === "object" && entry.msg && typeof entry.msg === "object" ? entry.msg.item : null;
  if (msgItem && typeof msgItem === "object" && msgItem.type === "command_execution" && typeof msgItem.command === "string") {
    const m = MARKER.exec(msgItem.command);
    if (m) return Number(m[2]);
  }

  const msg = entry && typeof entry === "object" ? entry.message : null;
  const content = msg && typeof msg === "object" ? msg.content : null;
  if (!Array.isArray(content)) return null; // string content is prose, never an invocation
  for (const block of content) {
    if (!block || typeof block !== "object" || block.type !== "tool_use") continue;
    const cmd = commandOf(block.input);
    if (typeof cmd !== "string") continue;
    const m = MARKER.exec(cmd);
    if (m) return Number(m[2]); // m[1] = verb, m[2] = id
  }
  return null;
}

// The executor's quest id = the FIRST mutating invocation (`quest start <id>` or
// `quest checkpoint <id>`) that appears as a real command invocation, scanning
// entries in transcript order. Returns id or null. Per-entry parsing is what keeps
// skill-text examples from keying detection; read verbs never match at all.
function executorQuestId(text) {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const id = markerIdInEntry(entry);
    if (id != null) return id;
  }
  return null;
}

try {
  const raw = await readStdin();
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }

  const transcriptPath = payload.transcript_path;
  if (typeof transcriptPath !== "string" || !transcriptPath) { diag("no transcript_path in payload; allowing"); allow(); }

  let transcript;
  try { transcript = readFileSync(transcriptPath, "utf8"); }
  catch (err) { diag(`cannot read transcript (${err.code || err.message}); allowing`); allow(); }

  const id = executorQuestId(transcript);
  if (id == null) allow(); // no mutating quest invocation (read-only agent) — leave it alone, silently

  // Prefer an explicit start field if a future payload carries one; else the
  // transcript's first timestamp.
  const start = toMs(payload.start_time) ?? toMs(payload.started_at) ?? firstTimestamp(transcript);
  if (start == null) { diag(`quest ${id}: could not determine subagent start time; allowing`); allow(); }

  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  let storeDir;
  try { storeDir = findStoreDir(cwd, process.env); }
  catch (err) { diag(`quest ${id}: ${err.message}; allowing`); allow(); }
  if (!storeDir) { diag(`quest ${id}: no store found from ${cwd}; allowing`); allow(); }

  let quest;
  try { quest = loadQuest(storeDir, id); }
  catch (err) { diag(`quest ${id}: ${err.message}; allowing`); allow(); }

  // A checkpoint recorded after the subagent started clears the stop.
  const latestCp = quest.checkpoints.reduce((max, cp) => {
    const ms = toMs(cp.timestamp);
    return ms != null && ms > max ? ms : max;
  }, -Infinity);
  if (latestCp > start) allow();

  // A terminal store status reached during this run also clears it — covers
  // `quest cancel`, which records a note rather than a checkpoint marker.
  const updated = toMs(quest.front.updated);
  if (TERMINAL.includes(quest.front.status) && updated != null && updated > start) allow();

  block(id);
} catch (err) {
  diag(err.message);
  process.exit(0);
}
