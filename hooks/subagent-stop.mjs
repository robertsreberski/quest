#!/usr/bin/env node
// SubagentStop hook. Blocks a quest-executor subagent that tries to stop without
// recording a checkpoint — the protocol's "no stop without a checkpoint" rule,
// enforced deterministically.
//
// A subagent counts as a quest-executor iff one of its transcript entries records
// an actual *mutating* quest invocation — `quest start <id>` or `quest checkpoint
// <id>` (under any binary prefix: `quest`, `./bin/quest`, `node bin/quest`) — as a
// tool_use block whose shell command carries the marker, OR the native subagent
// stop payload itself names the Quest-owned `quest-executor` agent and carries a
// launch prompt in the orchestrator's narrow `work quest <id>` shape. Read-only
// verbs (`quest show <id> --json`, `list`, `protocol`, `runs`) are how reviewers
// and orchestrators inspect a quest without owning it, so they must NEVER key
// detection: an agent whose transcript holds only read verbs is allowed silently.
// The executor id comes from the first mutating invocation (deterministic,
// transcript order) when present — including `quest checkpoint <id>`, because an
// executor resuming an already-in_progress quest skips `quest start` and its first
// mutating verb is the checkpoint. If no mutating command has run yet, a native
// `quest-executor` launch prompt with an explicit quest id can still identify the
// owner. We parse the JSONL per-entry and inspect only command inputs; prose,
// quoted skill text, examples, and echoed file contents live in text blocks and
// tool_result content (never in a command), so `quest start 12` / `quest checkpoint
// 12` examples in the skills can no longer key detection. No mutating invocation
// and no native executor launch id → not our concern, allow silently. We then
// compare the quest's latest checkpoint against the subagent's start time (the
// transcript's first timestamp): a checkpoint newer than start clears the stop; so
// does a terminal store status (complete/blocked/cancelled) reached during the run.
//
// Conservative by construction: any missing input, unknown store/quest,
// unreadable input, or parse failure → allow (exit 0). Expected allow paths stay
// silent so unrelated or partially-shaped subagents do not surface hook noise.
//
// Block contract (Claude Code command hook): print {"decision":"block","reason"}
// to stdout and exit 0. (Note: the {"ok":false,...} shape is for prompt/agent
// hooks, not command hooks — see the checkpoint notes for this quest.)

import { readFileSync, writeSync } from "node:fs";
import { findStoreDir } from "../lib/config.mjs";
import { loadQuest } from "../lib/store-local.mjs";

// Mutating quest verbs only. Group 1 is the verb, group 2 the id. The marker is
// anchored to a COMMAND position — an optional `node ` launcher and/or path prefix
// then `quest <verb> <id>` at the head of a command — so `quest checkpoint 1`
// merely quoted inside another program's argument (e.g. `grep 'quest checkpoint 1'`,
// `git commit -m "quest checkpoint 1"`) does not falsely key executor detection.
// Read verbs (show/list/protocol/runs) are deliberately absent.
const MARKER = /^(?:node\s+)?(?:[.\w/@-]*\/)?quest\s+(start|checkpoint)\s+(\d+)/;
const NATIVE_EXECUTOR_AGENT = "quest-executor";
const NATIVE_WORK_PROMPT = /\bwork\s+quest\s+(\d+)\b/i;

// Split a shell command into top-level segments on `&&`, `||`, `;`, `|`, and
// newline, IGNORING any separator that sits inside single or double quotes. This
// keeps quoted text (grep patterns, commit messages) from forging a command head.
// (Heredoc bodies on their own line remain a rare residual; a false "checkpoint"
// nudge is benign, and heredoc parsing is not worth the complexity in a hook.)
function splitTopLevel(s) {
  const segs = [];
  let buf = "";
  let quote = null;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) {
      buf += c;
      escaped = false;
      continue;
    }
    if (quote !== "'" && c === "\\") {
      buf += c;
      escaped = true;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      buf += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; buf += c; continue; }
    if ((c === "&" && s[i + 1] === "&") || (c === "|" && s[i + 1] === "|")) { segs.push(buf); buf = ""; i++; continue; }
    if (c === ";" || c === "|" || c === "\n") { segs.push(buf); buf = ""; continue; }
    buf += c;
  }
  segs.push(buf);
  return segs;
}

// Strip a leading shell wrapper (`bash -lc '…'`, `sh -c "…"`) and split the command
// chain, then look for a quest invocation at the head of any segment. Returns the
// marker id or null.
function markerIdInCommand(cmd) {
  if (typeof cmd !== "string") return null;
  let s = cmd.trim();
  const wrap = s.match(/^(?:sudo\s+)?(?:ba)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/);
  if (wrap) s = wrap[2].trim();
  for (const seg of splitTopLevel(s)) {
    const m = MARKER.exec(seg.trim());
    if (m) return Number(m[2]); // m[1] = verb, m[2] = id
  }
  return null;
}

// A Codex `command_execution` item's shell command, across the JSONL envelope
// shapes we know: top-level `item`, legacy `msg` (the item sits directly at
// `entry.msg`), and `msg.item`. Returns the command string or null.
function commandExecutionCommand(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "command_execution" && typeof node.command === "string") return node.command;
  return null;
}
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

function firstString(...values) {
  return values.find((v) => typeof v === "string" && v.trim());
}

function nativeExecutorQuestId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const agentType = firstString(payload.agent_type, payload.agentType, payload.agent_name, payload.agentName, payload.name);
  if (agentType !== NATIVE_EXECUTOR_AGENT) return null;
  const prompt = firstString(payload.prompt, payload.task_prompt, payload.taskPrompt, payload.agent_prompt, payload.agentPrompt);
  if (!prompt) return null;
  const m = NATIVE_WORK_PROMPT.exec(prompt);
  return m ? Number(m[1]) : null;
}

// The mutating-verb marker id from one transcript entry, considering only tool_use
// command invocations. Assistant messages carry an array of content blocks; string
// content (plain prose) and tool_result blocks (echoed output/file contents) are
// ignored. Matches `quest start <id>` or `quest checkpoint <id>` and returns the id.
function markerIdInEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  // Codex JSONL: a `command_execution` item under `item`, the legacy `msg`, or
  // `msg.item`. Handling all three keeps executor detection robust across shapes.
  for (const cand of [entry.item, entry.msg, entry.msg?.item]) {
    const cmd = commandExecutionCommand(cand);
    if (cmd != null) {
      const id = markerIdInCommand(cmd);
      if (id != null) return id;
    }
  }

  // Claude assistant messages: tool_use blocks carrying a shell command. String
  // content (plain prose) and tool_result blocks are ignored.
  const msg = entry.message;
  const content = msg && typeof msg === "object" ? msg.content : null;
  if (!Array.isArray(content)) return null; // string content is prose, never an invocation
  for (const block of content) {
    if (!block || typeof block !== "object" || block.type !== "tool_use") continue;
    const id = markerIdInCommand(commandOf(block.input));
    if (id != null) return id;
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
  if (typeof transcriptPath !== "string" || !transcriptPath) allow();

  let transcript;
  try { transcript = readFileSync(transcriptPath, "utf8"); }
  catch (err) { diag(`cannot read transcript (${err.code || err.message}); allowing`); allow(); }

  const id = executorQuestId(transcript) ?? nativeExecutorQuestId(payload);
  if (id == null) allow(); // no mutating quest invocation (read-only agent) — leave it alone, silently

  // Prefer an explicit start field if a future payload carries one; else the
  // transcript's first timestamp.
  const start = toMs(payload.start_time) ?? toMs(payload.started_at) ?? firstTimestamp(transcript);
  if (start == null) allow();

  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  let storeDir;
  try { storeDir = findStoreDir(cwd, process.env); }
  catch { allow(); }
  if (!storeDir) allow();

  let quest;
  try { quest = loadQuest(storeDir, id); }
  catch { allow(); }

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
