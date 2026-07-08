// The quest record contract: field validation, canonical serialization,
// checkpoint format, lint rules, status transitions. Byte-level spec:
// skills/protocol/references/contract-spec.md — this module IS that spec in code.

import { parseFrontmatter, serializeFrontmatter, FrontmatterError } from "./frontmatter.mjs";

export const STATUSES = ["todo", "in_progress", "blocked", "complete", "cancelled"];
export const QUEST_STATUSES = ["in_progress", "complete", "blocked"];
export const PRIORITIES = ["p0", "p1", "p2"];
export const WORKERS = ["claude", "codex"];
export const CHECKPOINT_MARKER = "<!-- quest:checkpoint -->";

const REQUIRED_FRONT = ["id", "title", "status", "priority", "worker", "model", "max_iterations", "created", "updated"];
const OPTIONAL_FRONT = ["effort", "max_cost", "parent", "depends_on"];
const FRONT_ORDER = ["id", "title", "status", "priority", "worker", "model", "effort", "max_iterations", "max_cost", "parent", "depends_on", "created", "updated"];
const REQUIRED_SECTIONS = ["## Objective", "## Done when", "## Validation loop"];
const SECTION_ORDER = ["## Objective", "## Done when", "## Validation loop", "## Constraints", "## Milestones", "## Context", "## Out of scope", "## Checkpoints"];

export class ContractError extends Error {
  constructor(message, { hint } = {}) {
    super(message);
    this.hint = hint;
  }
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function slugify(title) {
  let slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 40) {
    const cut = slug.slice(0, 41).lastIndexOf("-");
    slug = slug.slice(0, cut > 0 ? cut : 40);
  }
  return slug || "quest";
}

export function recordFilename(id, title) {
  return `${String(id).padStart(3, "0")}-${slugify(title)}.md`;
}

export function parseRecord(text) {
  let front, body;
  try {
    ({ front, body } = parseFrontmatter(text));
  } catch (err) {
    if (err instanceof FrontmatterError) throw new ContractError(err.message, { hint: "records are written by `quest` commands; see contract-spec.md for the exact format" });
    throw err;
  }
  return { front, body, checkpoints: parseCheckpoints(body) };
}

export function parseCheckpoints(body) {
  const checkpoints = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== CHECKPOINT_MARKER) continue;
    const header = lines[i + 1] ?? "";
    const hm = header.match(/^### (\S+) — quest_status: (\S+)$/);
    if (!hm) throw new ContractError(`malformed checkpoint header after marker at line ${i + 1}: "${header}"`);
    const cp = { timestamp: hm[1], quest_status: hm[2], fields: {}, note: "" };
    let j = i + 2;
    for (; j < lines.length; j++) {
      const fm = lines[j].match(/^- ([a-z_]+): (.*)$/);
      if (!fm) break;
      cp.fields[fm[1]] = fm[2];
    }
    const noteLines = [];
    for (; j < lines.length && lines[j].trim() !== CHECKPOINT_MARKER && !lines[j].startsWith("### "); j++) {
      noteLines.push(lines[j]);
    }
    cp.note = noteLines.join("\n").trim();
    checkpoints.push(cp);
  }
  return checkpoints;
}

export function makeCheckpoint({ timestamp, quest_status, iteration, changed, validation_summary, pr, head_sha, failed_approaches, compatible_expansion, reopen_reason, note }) {
  if (!QUEST_STATUSES.includes(quest_status)) {
    throw new ContractError(`quest_status must be one of ${QUEST_STATUSES.join(" | ")} (got "${quest_status}")`, { hint: "store statuses like todo/cancelled are not checkpoint verdicts" });
  }
  for (const [name, v] of [["iteration", iteration], ["changed", changed], ["validation_summary", validation_summary]]) {
    if (v === undefined || String(v).trim() === "") throw new ContractError(`checkpoint field "${name}" is required`, { hint: "see `quest checkpoint --help` for the full field list" });
  }
  if (quest_status === "complete" && !/`[^`]+`/.test(validation_summary)) {
    throw new ContractError("a `complete` checkpoint's validation_summary must cite at least one backticked command — commands, not adjectives", { hint: 'example: --validation "`npm test` → 42 passed"' });
  }
  const oneLine = (name, v) => {
    if (/\n/.test(String(v))) throw new ContractError(`checkpoint field "${name}" must be a single line (use the trailing note for prose)`);
    return String(v);
  };
  const out = [CHECKPOINT_MARKER, `### ${timestamp} — quest_status: ${quest_status}`, `- iteration: ${oneLine("iteration", iteration)}`];
  if (pr) out.push(`- pr: ${oneLine("pr", pr)}`);
  if (head_sha) out.push(`- head_sha: ${oneLine("head_sha", head_sha)}`);
  out.push(`- changed: ${oneLine("changed", changed)}`);
  out.push(`- validation_summary: ${oneLine("validation_summary", validation_summary)}`);
  if (failed_approaches) out.push(`- failed_approaches: ${oneLine("failed_approaches", failed_approaches)}`);
  if (compatible_expansion) out.push(`- compatible_expansion: ${oneLine("compatible_expansion", compatible_expansion)}`);
  if (reopen_reason) out.push(`- reopen_reason: ${oneLine("reopen_reason", reopen_reason)}`);
  if (note && String(note).trim() !== "") out.push("", String(note).trim());
  return out.join("\n");
}

export function serializeRecord(front, body) {
  const ordered = {};
  for (const key of FRONT_ORDER) if (key in front) ordered[key] = front[key];
  for (const key of Object.keys(front)) if (!(key in ordered)) ordered[key] = front[key];
  return `${serializeFrontmatter(ordered)}\n\n${body.replace(/^\n+/, "")}`;
}

const TRANSITIONS = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["in_progress", "complete", "blocked", "cancelled"],
  blocked: ["in_progress", "blocked", "cancelled"],
  complete: [],
  cancelled: [],
};

export function assertTransition(from, to) {
  if (!(TRANSITIONS[from] ?? []).includes(to)) {
    throw new ContractError(`illegal status transition: ${from} → ${to}`, {
      hint:
        from === "complete"
          ? "complete is terminal for checkpoints — use `quest reopen <id> --reason` to legally re-enter the loop"
          : from === "cancelled"
          ? "cancelled is terminal — file a new quest instead"
          : `legal from "${from}": ${(TRANSITIONS[from] ?? []).join(", ") || "(none)"}`,
    });
  }
}

// The single legal path from a terminal `complete` status back into the loop.
// Deliberately NOT part of TRANSITIONS.complete (which stays []): only the
// `quest reopen` verb calls this, so a stray checkpoint can never resurrect a
// complete quest. `cancelled` stays fully terminal — file a new quest instead.
export function assertReopen(from) {
  if (from === "complete") return;
  throw new ContractError(`cannot reopen a ${from} quest — only complete quests are reopenable`, {
    hint:
      from === "cancelled"
        ? "cancelled is terminal — file a new quest instead"
        : `${from} is not terminal; advance it with \`quest checkpoint\` (or \`quest start\` if todo)`,
  });
}

export function lintRecord({ front, body, checkpoints }, { filename } = {}) {
  const problems = [];
  for (const key of REQUIRED_FRONT) {
    if (!(key in front)) problems.push(`missing frontmatter key "${key}"`);
  }
  for (const key of Object.keys(front)) {
    if (!REQUIRED_FRONT.includes(key) && !OPTIONAL_FRONT.includes(key)) problems.push(`unknown frontmatter key "${key}"`);
  }
  if ("id" in front && (!Number.isInteger(front.id) || front.id < 1)) problems.push(`id must be a positive integer (got ${JSON.stringify(front.id)})`);
  if ("status" in front && !STATUSES.includes(front.status)) problems.push(`status must be one of ${STATUSES.join(" | ")} (got "${front.status}")`);
  if ("priority" in front && !PRIORITIES.includes(front.priority)) problems.push(`priority must be one of ${PRIORITIES.join(" | ")} (got "${front.priority}")`);
  if ("worker" in front && !WORKERS.includes(front.worker)) problems.push(`worker must be one of ${WORKERS.join(" | ")} (got "${front.worker}")`);
  if ("max_iterations" in front && (!Number.isInteger(front.max_iterations) || front.max_iterations < 1)) problems.push("max_iterations must be a positive integer");
  if ("depends_on" in front && (!Array.isArray(front.depends_on) || front.depends_on.some((d) => !Number.isInteger(d)))) problems.push("depends_on must be a list of quest ids");
  if ("parent" in front && !Number.isInteger(front.parent)) problems.push("parent must be a quest id");
  for (const ts of ["created", "updated"]) {
    if (ts in front && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(front[ts]))) problems.push(`${ts} must be UTC ISO-8601 ending in Z`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!body.split("\n").some((l) => l.trim() === section)) problems.push(`missing required section "${section}"`);
  }
  const present = SECTION_ORDER.filter((s) => body.split("\n").some((l) => l.trim() === s));
  const actual = body.split("\n").map((l) => l.trim()).filter((l) => SECTION_ORDER.includes(l));
  if (JSON.stringify(present) !== JSON.stringify(actual)) problems.push(`sections out of canonical order (expected ${present.join(" → ")})`);
  if (filename && "id" in front && "title" in front) {
    const expected = recordFilename(front.id, front.title);
    if (filename !== expected) problems.push(`filename "${filename}" does not match canonical "${expected}"`);
  }
  for (const [i, cp] of checkpoints.entries()) {
    if (!QUEST_STATUSES.includes(cp.quest_status)) problems.push(`checkpoint ${i + 1}: quest_status "${cp.quest_status}" not in ${QUEST_STATUSES.join(" | ")}`);
    for (const req of ["iteration", "changed", "validation_summary"]) {
      if (!cp.fields[req]) problems.push(`checkpoint ${i + 1}: missing required field "${req}"`);
    }
    if (cp.quest_status === "complete" && cp.fields.validation_summary && !/`[^`]+`/.test(cp.fields.validation_summary)) {
      problems.push(`checkpoint ${i + 1}: complete requires a backticked command in validation_summary`);
    }
  }
  if (front.status === "complete") {
    const last = checkpoints.at(-1);
    if (!last || last.quest_status !== "complete") problems.push('status is "complete" but the last checkpoint is not quest_status: complete');
  }
  return problems;
}

// Body rendering + section editing. Shared by every backend so the body bytes
// are identical whether a record lives on disk (store-local) or as a GitHub
// issue (store-github).

export function renderBody(title, s) {
  const lines = [`# ${title}`, "", "## Objective", s.objective.trim(), "", "## Done when"];
  for (const item of s.doneWhen) lines.push(`- [ ] ${item}`);
  lines.push("", "## Validation loop", "```bash", s.validation.trim(), "```");
  if (s.constraints?.length) {
    lines.push("", "## Constraints");
    for (const c of s.constraints) lines.push(`- ${c}`);
  }
  if (s.milestones?.length) {
    lines.push("", "## Milestones");
    for (const [i, m] of s.milestones.entries()) lines.push(`- [ ] M${i + 1} — ${m}`);
  }
  if (s.context) lines.push("", "## Context", s.context.trim());
  if (s.outOfScope?.length) {
    lines.push("", "## Out of scope");
    for (const o of s.outOfScope) lines.push(`- ${o}`);
  }
  lines.push("", "## Checkpoints", "");
  return lines.join("\n");
}

export function appendUnderCheckpoints(body, block) {
  const hasSection = body.split("\n").some((l) => l.trim() === "## Checkpoints");
  const trimmed = body.replace(/\n+$/, "");
  return hasSection ? `${trimmed}\n\n${block}\n` : `${trimmed}\n\n## Checkpoints\n\n${block}\n`;
}

export function appendToSection(body, section, line, { createAfter } = {}) {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim() === section);
  if (start === -1) {
    if (!createAfter) throw new ContractError(`section "${section}" not found`);
    const anchorEnd = sectionEnd(lines, createAfter);
    lines.splice(anchorEnd, 0, "", section, line);
    return lines.join("\n");
  }
  lines.splice(sectionEnd(lines, section), 0, line);
  return lines.join("\n");
}

function sectionEnd(lines, section) {
  const start = lines.findIndex((l) => l.trim() === section);
  if (start === -1) throw new ContractError(`section "${section}" not found`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  return end;
}
