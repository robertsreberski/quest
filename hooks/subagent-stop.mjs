#!/usr/bin/env node
// SubagentStop hook. Blocks a quest-executor subagent that tries to stop without
// recording a checkpoint — the protocol's "no stop without a checkpoint" rule,
// enforced deterministically.
//
// A subagent counts as a quest-executor iff one of its transcript entries records
// an actual `quest show <id> --json` *command invocation* — a tool_use block whose
// shell command carries the marker. We parse the JSONL per-entry and inspect only
// tool_use command inputs; prose, quoted skill text, examples, and echoed file
// contents live in text blocks and tool_result content (never in a tool_use
// command), so the `quest show 12 --json` examples in the skills can no longer key
// the detection. The FIRST real invocation wins (deterministic, transcript order).
// No real invocation → not our concern, allow silently. We then compare the quest's
// latest checkpoint against the subagent's start time (the transcript's first
// timestamp): a checkpoint newer than start clears the stop; so does a terminal
// store status (complete/blocked/cancelled) reached during the run.
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

const MARKER = /quest\s+show\s+(\d+)\s+--json/;
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

// The marker id from one transcript entry, considering only tool_use command
// invocations. Assistant messages carry an array of content blocks; string content
// (plain prose) and tool_result blocks (echoed output/file contents) are ignored.
function markerIdInEntry(entry) {
  const msg = entry && typeof entry === "object" ? entry.message : null;
  const content = msg && typeof msg === "object" ? msg.content : null;
  if (!Array.isArray(content)) return null; // string content is prose, never an invocation
  for (const block of content) {
    if (!block || typeof block !== "object" || block.type !== "tool_use") continue;
    const cmd = commandOf(block.input);
    if (typeof cmd !== "string") continue;
    const m = MARKER.exec(cmd);
    if (m) return Number(m[1]);
  }
  return null;
}

// The executor's quest id = the FIRST `quest show <id> --json` that appears as a
// real command invocation, scanning entries in transcript order. Returns id or
// null. Per-entry parsing is what keeps skill-text examples from keying detection.
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
  if (id == null) allow(); // no real `quest show <id> --json` invocation — leave it alone, silently

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
