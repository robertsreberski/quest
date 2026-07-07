// Local backend: quest records as markdown files under .quests/quests/.
// This module (via the CLI) is the single write path for records — nothing
// else writes them. Read-modify-write is guarded by a mkdir lock.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { join, basename } from "node:path";
import { ContractError, appendToSection, appendUnderCheckpoints, assertTransition, lintRecord, makeCheckpoint, nowIso, parseRecord, recordFilename, renderBody, serializeRecord, CHECKPOINT_MARKER } from "./contract.mjs";

export class NotFoundError extends Error {
  constructor(id) {
    super(`quest ${id} not found`);
    this.hint = "run `quest list` to see known quests";
  }
}

const LOCK_STALE_MS = 10_000;

function withLock(storeDir, fn) {
  const lockDir = join(storeDir, ".lock");
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch {
      let stale = false;
      try {
        stale = Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS;
      } catch {
        continue; // lock vanished between attempts — retry immediately
      }
      if (stale) {
        try { rmdirSync(lockDir); } catch { /* racing unlocker — retry */ }
        continue;
      }
      if (Date.now() > deadline) throw new ContractError("store is locked by another quest process", { hint: `if no other process is running, remove ${lockDir}` });
      const wait = 25 + Math.random() * 50;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  try {
    return fn();
  } finally {
    try { rmdirSync(lockDir); } catch { /* already released */ }
  }
}

function questsDir(storeDir) {
  return join(storeDir, "quests");
}

function recordFiles(storeDir) {
  const dir = questsDir(storeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{3}-.*\.md$/.test(f)).sort();
}

export function initLocalStore(rootDir) {
  const storeDir = join(rootDir, ".quests");
  if (existsSync(join(storeDir, "config.json"))) {
    throw new ContractError(`a quest store already exists at ${storeDir}`, { hint: "use the existing store, or delete it first if you really mean to start over" });
  }
  mkdirSync(questsDir(storeDir), { recursive: true });
  return storeDir;
}

export function loadQuest(storeDir, id) {
  const prefix = String(id).padStart(3, "0") + "-";
  const file = recordFiles(storeDir).find((f) => f.startsWith(prefix));
  if (!file) throw new NotFoundError(id);
  const path = join(questsDir(storeDir), file);
  const text = readFileSync(path, "utf8");
  const record = parseRecord(text);
  if (record.front.id !== Number(id)) throw new ContractError(`file ${file} claims id ${record.front.id}, expected ${id}`);
  return { path, file, text, ...record };
}

export function listQuests(storeDir) {
  return recordFiles(storeDir).map((file) => {
    const { front, checkpoints } = parseRecord(readFileSync(join(questsDir(storeDir), file), "utf8"));
    return { ...front, checkpoints: checkpoints.length, file };
  });
}

export function readyQuests(storeDir) {
  const all = listQuests(storeDir);
  const done = new Set(all.filter((q) => q.status === "complete").map((q) => q.id));
  return all
    .filter((q) => q.status === "todo" && (q.depends_on ?? []).every((d) => done.has(d)))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.id - b.id);
}

export function createQuest(storeDir, defaults, fields, bodySections) {
  return withLock(storeDir, () => {
    const existing = listQuests(storeDir);
    const id = existing.reduce((max, q) => Math.max(max, q.id), 0) + 1;
    const ts = nowIso();
    const front = {
      id,
      title: fields.title,
      status: "todo",
      priority: fields.priority ?? defaults.priority,
      worker: fields.worker ?? defaults.worker,
      model: fields.model ?? "inherit",
      ...(fields.effort ? { effort: fields.effort } : {}),
      max_iterations: fields.max_iterations ?? defaults.max_iterations,
      ...(fields.max_cost !== undefined ? { max_cost: fields.max_cost } : {}),
      ...(fields.parent !== undefined ? { parent: fields.parent } : {}),
      ...(fields.depends_on?.length ? { depends_on: fields.depends_on } : {}),
      created: ts,
      updated: ts,
    };
    if (fields.parent !== undefined && !existing.some((q) => q.id === fields.parent)) throw new NotFoundError(fields.parent);
    for (const dep of front.depends_on ?? []) {
      if (!existing.some((q) => q.id === dep)) throw new ContractError(`depends_on references unknown quest ${dep}`, { hint: "create dependencies first, or fix the id" });
    }
    const body = renderBody(fields.title, bodySections);
    const record = { front, body, checkpoints: [] };
    const problems = lintRecord(record);
    if (problems.length) throw new ContractError(`new quest fails lint:\n  - ${problems.join("\n  - ")}`, { hint: "see `quest create --help` for required fields" });
    const path = join(questsDir(storeDir), recordFilename(id, fields.title));
    writeFileSync(path, serializeRecord(front, body), { flag: "wx" });
    return { id, path, front };
  });
}

function updateQuest(storeDir, id, mutate) {
  return withLock(storeDir, () => {
    const q = loadQuest(storeDir, id);
    const next = mutate(q);
    next.front.updated = nowIso();
    const newText = serializeRecord(next.front, next.body);
    const canonical = recordFilename(next.front.id, next.front.title);
    writeFileSync(q.path, newText);
    if (basename(q.path) !== canonical) renameSync(q.path, join(questsDir(storeDir), canonical));
    return { path: q.path, file: q.file, text: newText, ...parseRecord(newText) };
  });
}

export function startQuest(storeDir, id) {
  return updateQuest(storeDir, id, (q) => {
    assertTransition(q.front.status, "in_progress");
    return { front: { ...q.front, status: "in_progress" }, body: q.body };
  });
}

export function appendCheckpoint(storeDir, id, cp) {
  return updateQuest(storeDir, id, (q) => {
    assertTransition(q.front.status, cp.quest_status);
    const block = makeCheckpoint({ ...cp, timestamp: nowIso() });
    const body = appendUnderCheckpoints(q.body, block);
    return { front: { ...q.front, status: cp.quest_status }, body };
  });
}

export function cancelQuest(storeDir, id, reason) {
  if (!reason || !reason.trim()) throw new ContractError("cancellation requires --reason", { hint: 'example: quest cancel 4 --reason "superseded by quest 7"' });
  return updateQuest(storeDir, id, (q) => {
    assertTransition(q.front.status, "cancelled");
    const body = appendUnderCheckpoints(q.body, `**Cancelled ${nowIso()}** — ${reason.trim()}`);
    return { front: { ...q.front, status: "cancelled" }, body };
  });
}

export function editQuest(storeDir, id, { addDoneWhen = [], addMilestone = [], addContext, rationale }) {
  if (!rationale || !rationale.trim()) throw new ContractError("edit requires --rationale (scope changes are recorded, per protocol)", { hint: "state why this is a compatible expansion of the Objective" });
  if (!addDoneWhen.length && !addMilestone.length && !addContext) throw new ContractError("nothing to add — pass --add-done-when, --add-milestone, or --add-context", { hint: "the Objective and existing Done-when items are immutable by design" });
  return updateQuest(storeDir, id, (q) => {
    let body = q.body;
    for (const item of addDoneWhen) body = appendToSection(body, "## Done when", `- [ ] ${item}`);
    for (const item of addMilestone) body = appendToSection(body, "## Milestones", `- [ ] ${item}`, { createAfter: "## Validation loop" });
    if (addContext) body = appendToSection(body, "## Context", addContext, { createAfter: "## Milestones" });
    if (["in_progress", "blocked"].includes(q.front.status)) {
      const block = makeCheckpoint({
        timestamp: nowIso(),
        quest_status: q.front.status,
        iteration: q.checkpoints.length + 1,
        changed: `compatible expansion: ${[...addDoneWhen, ...addMilestone, addContext].filter(Boolean).join("; ").slice(0, 200)}`,
        validation_summary: "contract expansion only; no execution this entry",
        compatible_expansion: rationale.trim(),
      });
      body = appendUnderCheckpoints(body, block);
    } else {
      body = appendUnderCheckpoints(body, `**Expanded ${nowIso()}** — ${rationale.trim()}`);
    }
    return { front: q.front, body };
  });
}

export function appendAmendment(storeDir, text) {
  const path = join(storeDir, "amendments.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "# Protocol amendments\n";
  const n = (existing.match(/^## Amendment /gm) ?? []).length + 1;
  const cleaned = existing.replace(/\n\(none yet\)\n?/, "\n");
  writeFileSync(path, `${cleaned.replace(/\n+$/, "\n")}\n## Amendment ${n} — ${nowIso()}\n\n${text.trim()}\n`);
  return { number: n, path };
}

export function appendRunEvent(storeDir, event) {
  appendFileSync(join(storeDir, "runs.ndjson"), JSON.stringify(event) + "\n");
}

export function readRuns(storeDir) {
  const path = join(storeDir, "runs.ndjson");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function lintAll(storeDir) {
  const results = [];
  for (const file of recordFiles(storeDir)) {
    const text = readFileSync(join(questsDir(storeDir), file), "utf8");
    try {
      const record = parseRecord(text);
      const problems = lintRecord(record, { filename: file });
      results.push({ file, id: record.front.id, problems });
    } catch (err) {
      results.push({ file, id: null, problems: [err.message] });
    }
  }
  return results;
}

export { CHECKPOINT_MARKER };
