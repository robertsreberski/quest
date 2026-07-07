#!/usr/bin/env node
// SubagentStop hook. Blocks a quest-executor subagent that tries to stop without
// recording a checkpoint — the protocol's "no stop without a checkpoint" rule,
// enforced deterministically.
//
// A subagent counts as a quest-executor iff its transcript contains a
// `quest show <id> --json` invocation (the mandatory orientation marker). We take
// the FIRST id. No marker → not our concern, allow silently. We then compare the
// quest's latest checkpoint against the subagent's start time (the transcript's
// first timestamp): a checkpoint newer than start clears the stop; so does a
// terminal store status (complete/blocked/cancelled) reached during the run.
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

try {
  const raw = await readStdin();
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }

  const transcriptPath = payload.transcript_path;
  if (typeof transcriptPath !== "string" || !transcriptPath) { diag("no transcript_path in payload; allowing"); allow(); }

  let transcript;
  try { transcript = readFileSync(transcriptPath, "utf8"); }
  catch (err) { diag(`cannot read transcript (${err.code || err.message}); allowing`); allow(); }

  const m = MARKER.exec(transcript);
  if (!m) allow(); // not a quest-executor subagent — leave it entirely alone, silently
  const id = Number(m[1]);

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
