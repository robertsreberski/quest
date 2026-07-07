#!/usr/bin/env node
// SessionStart hook (startup / clear / compact). When a `.quests/` store exists
// at or above the session's cwd, write a short one-paragraph summary of in-flight
// quests and active runs to stdout — Claude Code injects stdout as session
// context. No store, a non-local backend, an empty store, or ANY error → a silent
// no-op (exit 0). Reads only; no network and no child processes, so it stays fast.

import { writeSync } from "node:fs";
import { findStoreDir, loadConfig } from "../lib/config.mjs";
import { listQuests, readRuns } from "../lib/store-local.mjs";

const STATUS_ORDER = ["in_progress", "blocked", "todo", "complete", "cancelled"];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function activeRunCount(storeDir) {
  const runs = readRuns(storeDir);
  const ended = new Set(runs.filter((r) => r.event === "run_ended").map((r) => r.run_id));
  return runs.filter((r) => r.event === "run_started" && !ended.has(r.run_id)).length;
}

// One paragraph (<= ~3 lines): counts by status, up to 3 in-flight quests, the
// active-run count, and the ready-list hint. Returns null when there is nothing
// worth injecting (empty store).
function buildContext(storeDir) {
  const all = listQuests(storeDir);
  if (!all.length) return null;
  const counts = {};
  for (const q of all) counts[q.status] = (counts[q.status] ?? 0) + 1;
  const countStr = STATUS_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ");
  const inFlight = all
    .filter((q) => q.status === "in_progress" || q.status === "blocked")
    .sort((a, b) => (a.status === b.status ? a.id - b.id : a.status === "in_progress" ? -1 : 1))
    .slice(0, 3)
    .map((q) => `#${q.id} ${q.title} [${q.status}]`);
  const lines = [`Quest store (.quests): ${all.length} quest${all.length === 1 ? "" : "s"} — ${countStr}.`];
  if (inFlight.length) lines.push(`In flight: ${inFlight.join("; ")}.`);
  lines.push(`Active runs: ${activeRunCount(storeDir)}. Ready to work next: \`quest list --ready\`.`);
  return lines.join("\n");
}

try {
  const raw = await readStdin();
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const storeDir = findStoreDir(cwd, process.env);
  if (!storeDir) process.exit(0); // no store here — silent no-op, NOT an error
  if (loadConfig(storeDir, process.env).backend !== "local") process.exit(0); // only local is readable today
  const context = buildContext(storeDir);
  if (context) writeSync(1, context + "\n");
  process.exit(0);
} catch (err) {
  // Never turn a best-effort context hint into a session error.
  writeSync(2, `quest session-start hook: ${err.message}\n`);
  process.exit(0);
}
