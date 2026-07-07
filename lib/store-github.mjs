// GitHub Issues backend: quest records live as issues, driven entirely through
// the `gh` CLI. The mapping (see skills/protocol/references/contract-spec.md,
// "GitHub backend mapping") is:
//   record      → issue (body = the same body sections, minus ## Checkpoints)
//   frontmatter → an <!-- quest:meta --> HTML block at the top of the body
//                 (status/priority live in labels, not meta)
//   id          → issue number
//   status      → labels quest:todo|in-progress|blocked|complete|cancelled
//                 (+ marker label `quest`); issue state mirrored
//   priority    → labels quest-p0|p1|p2
//   checkpoint  → issue comment, byte-identical to the local checkpoint block
//   parent/child→ child meta `parent:` + epic body ## Children task list
// Config, amendments and the runs journal stay LOCAL in .quests/ — only the
// records live remotely. Every gh failure surfaces gh's own stderr and exits 6;
// there is never a fallback to the local backend.

import { execFileSync } from "node:child_process";
import {
  CHECKPOINT_MARKER,
  ContractError,
  appendToSection,
  appendUnderCheckpoints,
  assertTransition,
  lintRecord,
  makeCheckpoint,
  nowIso,
  parseCheckpoints,
  recordFilename,
  renderBody,
  serializeRecord,
} from "./contract.mjs";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.mjs";
import { NotFoundError } from "./store-local.mjs";

export class GhError extends Error {
  constructor(message, { hint, stderr } = {}) {
    super(message);
    this.hint = hint;
    this.stderr = stderr;
  }
}

const MARKER_LABEL = "quest";
// Note the hyphen in the in-progress *label* vs the underscore in the *status*.
const STATUS_LABEL = { todo: "quest:todo", in_progress: "quest:in-progress", blocked: "quest:blocked", complete: "quest:complete", cancelled: "quest:cancelled" };
const LABEL_STATUS = { todo: "todo", "in-progress": "in_progress", blocked: "blocked", complete: "complete", cancelled: "cancelled" };
const PRIORITY_LABEL = { p0: "quest-p0", p1: "quest-p1", p2: "quest-p2" };

function gh(args, { env = process.env, input } = {}) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024, env });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new GhError("the `gh` CLI was not found on PATH", { hint: "install GitHub CLI — https://cli.github.com — then `gh auth login`" });
    }
    const stderr = (err.stderr ? err.stderr.toString() : "").trim();
    throw new GhError(`gh ${args.join(" ")} failed: ${stderr || err.message}`, {
      hint: "check `gh auth status`, the repo name, and your access",
      stderr,
    });
  }
}

// --- init helpers ---------------------------------------------------------

export function assertAuth(env) {
  try {
    // Scope to github.com: `gh auth status` (no host) also probes any configured
    // enterprise hosts, and one of those timing out would wrongly fail the check
    // even when github.com auth is green. `--repo owner/name` resolves to
    // github.com, so that is the host that matters here.
    gh(["auth", "status", "--hostname", "github.com"], { env });
  } catch (err) {
    if (err instanceof GhError) {
      throw new GhError(`GitHub CLI is not ready: ${err.stderr || err.message}`, {
        hint: "run `gh auth login` (install gh first if missing: https://cli.github.com)",
        stderr: err.stderr,
      });
    }
    throw err;
  }
}

export function ensureLabels(repo, env) {
  const labels = [
    [MARKER_LABEL, "5319e7", "quest record marker"],
    [STATUS_LABEL.todo, "ededed", "quest status: todo"],
    [STATUS_LABEL.in_progress, "1d76db", "quest status: in progress"],
    [STATUS_LABEL.blocked, "b60205", "quest status: blocked"],
    [STATUS_LABEL.complete, "0e8a16", "quest status: complete"],
    [STATUS_LABEL.cancelled, "6a737d", "quest status: cancelled"],
    [PRIORITY_LABEL.p0, "d93f0b", "quest priority p0"],
    [PRIORITY_LABEL.p1, "fbca04", "quest priority p1"],
    [PRIORITY_LABEL.p2, "c2e0c6", "quest priority p2"],
  ];
  for (const [name, color, description] of labels) {
    gh(["label", "create", name, "--repo", repo, "--color", color, "--description", description, "--force"], { env });
  }
}

// --- meta block <-> object ------------------------------------------------

function serializeMeta(meta) {
  const inner = serializeFrontmatter(meta).split("\n").slice(1, -1).join("\n"); // drop the `---` fences
  return `<!-- quest:meta\n${inner}\n-->`;
}

function parseMeta(inner) {
  return parseFrontmatter(`---\n${inner}\n---\n`).front; // reuse the strict frontmatter parser
}

function splitStoredBody(body) {
  const m = String(body).match(/<!-- quest:meta\n([\s\S]*?)\n-->/);
  if (!m) throw new ContractError("quest issue is missing its <!-- quest:meta --> block", { hint: "records are written by `quest`; this issue was not created by quest or was hand-edited" });
  const meta = parseMeta(m[1]);
  const storedSections = body.slice(m.index + m[0].length).replace(/^\n+/, "").replace(/\n+$/, "");
  return { meta, storedSections };
}

// --- label helpers --------------------------------------------------------

function statusFromLabels(labels) {
  for (const l of labels ?? []) {
    const m = l.name.match(/^quest:(.+)$/);
    if (m && LABEL_STATUS[m[1]]) return LABEL_STATUS[m[1]];
  }
  throw new ContractError("quest issue has no quest:<status> label");
}

function priorityFromLabels(labels) {
  for (const l of labels ?? []) {
    const m = l.name.match(/^quest-(p[012])$/);
    if (m) return m[1];
  }
  throw new ContractError("quest issue has no quest-p<n> priority label");
}

function buildFront(issue, meta) {
  const front = {
    id: issue.number,
    title: meta.title,
    status: statusFromLabels(issue.labels),
    priority: priorityFromLabels(issue.labels),
    worker: meta.worker,
    model: meta.model,
    ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
    max_iterations: meta.max_iterations,
    ...(meta.max_cost !== undefined ? { max_cost: meta.max_cost } : {}),
    ...(meta.parent !== undefined ? { parent: meta.parent } : {}),
    ...(meta.depends_on !== undefined ? { depends_on: meta.depends_on } : {}),
    created: meta.created,
    updated: meta.updated,
  };
  return front;
}

function normalizeComment(raw) {
  return String(raw).replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

// Rebuild the in-memory record so it is byte-identical to what the local
// backend would hold: body = stored sections + a ## Checkpoints section into
// which every comment (checkpoints and cancel/expand notes alike) is folded in
// chronological order, exactly as store-local appends them.
function reconstruct(issue) {
  const { meta, storedSections } = splitStoredBody(issue.body);
  const front = buildFront(issue, meta);
  const comments = (issue.comments ?? []).map((c) => normalizeComment(c.body));
  let body = storedSections;
  if (comments.length === 0) body = `${storedSections}\n\n## Checkpoints\n`;
  else for (const block of comments) body = appendUnderCheckpoints(body, block);
  // store-local parses records back out of the frontmatter fence, which leaves a
  // single leading newline before `# title`; mirror it so `show --json` bodies
  // are byte-identical across backends.
  body = `\n${body}`;
  const checkpoints = parseCheckpoints(body);
  return {
    path: issue.url ?? `#${front.id}`,
    file: recordFilename(front.id, front.title),
    text: serializeRecord(front, body),
    front,
    body,
    checkpoints,
    meta,
    storedSections,
    state: issue.state,
    labels: issue.labels ?? [],
  };
}

// --- gh reads -------------------------------------------------------------

const VIEW_FIELDS = "number,title,body,state,stateReason,labels,comments,url";
const LIST_FIELDS = "number,title,body,labels,comments,url";

function viewIssue(repo, id, env) {
  let out;
  try {
    out = gh(["issue", "view", String(id), "--repo", repo, "--json", VIEW_FIELDS], { env });
  } catch (err) {
    if (err instanceof GhError && /could not resolve|not found|no issue/i.test(err.stderr ?? err.message)) {
      throw new NotFoundError(id);
    }
    throw err;
  }
  const issue = JSON.parse(out);
  if (!(issue.labels ?? []).some((l) => l.name === MARKER_LABEL)) throw new NotFoundError(id);
  return issue;
}

function listIssues(repo, env) {
  const out = gh(["issue", "list", "--repo", repo, "--label", MARKER_LABEL, "--state", "all", "--json", LIST_FIELDS, "--limit", "500"], { env });
  return JSON.parse(out);
}

// --- gh writes (issue body / labels / state) ------------------------------

function writeStoredBody(repo, id, meta, storedSections, env) {
  const body = `${serializeMeta(meta)}\n\n${storedSections.replace(/\n+$/, "")}\n`;
  gh(["issue", "edit", String(id), "--repo", repo, "--body-file", "-"], { env, input: body });
}

// Swap the status label and mirror the transition onto the issue's open/closed
// state: complete → closed (completed), cancelled → closed (not planned),
// in_progress/blocked → reopen if the issue was closed.
function applyStatus(repo, id, currentLabels, currentState, newStatus, env) {
  const oldLabel = (currentLabels ?? []).map((l) => l.name).find((n) => /^quest:/.test(n));
  const newLabel = STATUS_LABEL[newStatus];
  if (newLabel && oldLabel !== newLabel) {
    const args = ["issue", "edit", String(id), "--repo", repo];
    if (oldLabel) args.push("--remove-label", oldLabel);
    args.push("--add-label", newLabel);
    gh(args, { env });
  }
  if (newStatus === "complete") gh(["issue", "close", String(id), "--repo", repo, "--reason", "completed"], { env });
  else if (newStatus === "cancelled") gh(["issue", "close", String(id), "--repo", repo, "--reason", "not planned"], { env });
  else if ((newStatus === "in_progress" || newStatus === "blocked") && currentState === "CLOSED") gh(["issue", "reopen", String(id), "--repo", repo], { env });
}

function appendChild(storedSections, childNum) {
  const line = `- [ ] #${childNum}`;
  const lines = storedSections.split("\n");
  const idx = lines.findIndex((l) => l.trim() === "## Children");
  if (idx === -1) return `${storedSections.replace(/\n+$/, "")}\n\n## Children\n${line}`;
  let end = idx + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  while (end > idx + 1 && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, line);
  return lines.join("\n");
}

// --- operational surface (mirrors store-local) ----------------------------

export function loadQuest(repo, id, env) {
  return reconstruct(viewIssue(repo, id, env));
}

export function listQuests(repo, env) {
  return listIssues(repo, env).map((issue) => {
    const { meta } = splitStoredBody(issue.body);
    const front = buildFront(issue, meta);
    const comments = issue.comments;
    const checkpoints = Array.isArray(comments)
      ? comments.filter((c) => (c.body || "").includes(CHECKPOINT_MARKER)).length
      : Number(comments) || 0;
    return { ...front, checkpoints, file: recordFilename(front.id, front.title) };
  });
}

// Same readiness rule as store-local.readyQuests, over the remote list.
export function readyQuests(repo, env) {
  const all = listQuests(repo, env);
  const done = new Set(all.filter((q) => q.status === "complete").map((q) => q.id));
  return all
    .filter((q) => q.status === "todo" && (q.depends_on ?? []).every((d) => done.has(d)))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.id - b.id);
}

export function createQuest(repo, defaults, fields, sections, env) {
  const ts = nowIso();
  const priority = fields.priority ?? defaults.priority;
  const worker = fields.worker ?? defaults.worker;
  const model = fields.model ?? "inherit";
  const max_iterations = fields.max_iterations ?? defaults.max_iterations;

  // Validate references before mutating anything.
  let parentIssue;
  if (fields.parent !== undefined) parentIssue = viewIssue(repo, fields.parent, env); // throws NotFound if missing/non-quest
  if (fields.depends_on?.length) {
    const known = new Set(listIssues(repo, env).map((i) => i.number));
    for (const dep of fields.depends_on) {
      if (!known.has(dep)) throw new ContractError(`depends_on references unknown quest ${dep}`, { hint: "create dependencies first, or fix the id" });
    }
  }

  const meta = { title: fields.title, worker, model };
  if (fields.effort) meta.effort = fields.effort;
  meta.max_iterations = max_iterations;
  if (fields.max_cost !== undefined) meta.max_cost = fields.max_cost;
  if (fields.parent !== undefined) meta.parent = fields.parent;
  if (fields.depends_on?.length) meta.depends_on = fields.depends_on;
  meta.created = ts;
  meta.updated = ts;

  // Lint an equivalent local record (id assigned by GitHub later) before any gh
  // mutation, so a malformed quest fails 5 without creating an issue.
  const fullBody = renderBody(fields.title, sections);
  const front0 = {
    id: 1,
    title: fields.title,
    status: "todo",
    priority,
    worker,
    model,
    ...(fields.effort ? { effort: fields.effort } : {}),
    max_iterations,
    ...(fields.max_cost !== undefined ? { max_cost: fields.max_cost } : {}),
    ...(fields.parent !== undefined ? { parent: fields.parent } : {}),
    ...(fields.depends_on?.length ? { depends_on: fields.depends_on } : {}),
    created: ts,
    updated: ts,
  };
  const problems = lintRecord({ front: front0, body: fullBody, checkpoints: [] });
  if (problems.length) throw new ContractError(`new quest fails lint:\n  - ${problems.join("\n  - ")}`, { hint: "see `quest create --help` for required fields" });

  const storedSections = fullBody.replace(/\n*## Checkpoints\s*$/, "");
  const issueBody = `${serializeMeta(meta)}\n\n${storedSections}\n`;
  const args = ["issue", "create", "--repo", repo, "--title", fields.title, "--body-file", "-"];
  for (const label of [MARKER_LABEL, STATUS_LABEL.todo, PRIORITY_LABEL[priority]]) args.push("--label", label);
  const out = gh(args, { env, input: issueBody });
  const m = out.match(/\/issues\/(\d+)/);
  if (!m) throw new GhError(`could not parse the new issue number from gh output: ${out.trim()}`, { hint: "is gh >= 2.0?" });
  const id = Number(m[1]);

  if (parentIssue) {
    const prec = reconstruct(parentIssue);
    writeStoredBody(repo, fields.parent, { ...prec.meta, updated: nowIso() }, appendChild(prec.storedSections, id), env);
  }

  return { id, path: `https://github.com/${repo}/issues/${id}`, front: { ...front0, id } };
}

export function startQuest(repo, id, env) {
  const rec = reconstruct(viewIssue(repo, id, env));
  assertTransition(rec.front.status, "in_progress");
  const updated = nowIso();
  writeStoredBody(repo, id, { ...rec.meta, updated }, rec.storedSections, env);
  applyStatus(repo, id, rec.labels, rec.state, "in_progress", env);
  return { front: { ...rec.front, status: "in_progress", updated } };
}

export function appendCheckpoint(repo, id, cp, env) {
  const rec = reconstruct(viewIssue(repo, id, env));
  assertTransition(rec.front.status, cp.quest_status);
  const block = makeCheckpoint({ ...cp, timestamp: nowIso() });
  gh(["issue", "comment", String(id), "--repo", repo, "--body-file", "-"], { env, input: block });
  const updated = nowIso();
  writeStoredBody(repo, id, { ...rec.meta, updated }, rec.storedSections, env);
  applyStatus(repo, id, rec.labels, rec.state, cp.quest_status, env);
  return { front: { ...rec.front, status: cp.quest_status, updated }, checkpoints: [...rec.checkpoints, ...parseCheckpoints(block)] };
}

export function cancelQuest(repo, id, reason, env) {
  if (!reason || !reason.trim()) throw new ContractError("cancellation requires --reason", { hint: 'example: quest cancel 4 --reason "superseded by quest 7"' });
  const rec = reconstruct(viewIssue(repo, id, env));
  assertTransition(rec.front.status, "cancelled");
  const note = `**Cancelled ${nowIso()}** — ${reason.trim()}`;
  gh(["issue", "comment", String(id), "--repo", repo, "--body-file", "-"], { env, input: note });
  const updated = nowIso();
  writeStoredBody(repo, id, { ...rec.meta, updated }, rec.storedSections, env);
  applyStatus(repo, id, rec.labels, rec.state, "cancelled", env);
  return { front: { ...rec.front, status: "cancelled", updated } };
}

export function editQuest(repo, id, { addDoneWhen = [], addMilestone = [], addContext, rationale }, env) {
  if (!rationale || !rationale.trim()) throw new ContractError("edit requires --rationale (scope changes are recorded, per protocol)", { hint: "state why this is a compatible expansion of the Objective" });
  if (!addDoneWhen.length && !addMilestone.length && !addContext) throw new ContractError("nothing to add — pass --add-done-when, --add-milestone, or --add-context", { hint: "the Objective and existing Done-when items are immutable by design" });
  const rec = reconstruct(viewIssue(repo, id, env));
  let sections = rec.storedSections;
  for (const item of addDoneWhen) sections = appendToSection(sections, "## Done when", `- [ ] ${item}`);
  for (const item of addMilestone) sections = appendToSection(sections, "## Milestones", `- [ ] ${item}`, { createAfter: "## Validation loop" });
  if (addContext) sections = appendToSection(sections, "## Context", addContext, { createAfter: "## Milestones" });
  const updated = nowIso();
  writeStoredBody(repo, id, { ...rec.meta, updated }, sections, env);
  let comment;
  if (["in_progress", "blocked"].includes(rec.front.status)) {
    comment = makeCheckpoint({
      timestamp: updated,
      quest_status: rec.front.status,
      iteration: rec.checkpoints.length + 1,
      changed: `compatible expansion: ${[...addDoneWhen, ...addMilestone, addContext].filter(Boolean).join("; ").slice(0, 200)}`,
      validation_summary: "contract expansion only; no execution this entry",
      compatible_expansion: rationale.trim(),
    });
  } else {
    comment = `**Expanded ${updated}** — ${rationale.trim()}`;
  }
  gh(["issue", "comment", String(id), "--repo", repo, "--body-file", "-"], { env, input: comment });
  return { front: rec.front };
}

export function lintAll(repo, env) {
  const results = [];
  for (const issue of listIssues(repo, env)) {
    try {
      const rec = reconstruct(issue);
      results.push({ file: rec.file, id: rec.front.id, problems: lintRecord(rec, { filename: rec.file }) });
    } catch (err) {
      results.push({ file: `#${issue.number}`, id: issue.number ?? null, problems: [err.message] });
    }
  }
  return results;
}

export { CHECKPOINT_MARKER };
