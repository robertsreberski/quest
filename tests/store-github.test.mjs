// Full-lifecycle round-trip of the GitHub backend through run() from lib/cli.mjs,
// driven against a fake `gh` on PATH (tests/shims/gh). Asserts shape parity with
// the local backend and fail-honest exit-6 behavior when gh is missing/failing.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../lib/cli.mjs";

const SHIMS = new URL("./shims/", import.meta.url).pathname;

let cwd, statePath, out, err, env;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "quest-gh-"));
  const stateDir = mkdtempSync(join(tmpdir(), "quest-gh-state-"));
  statePath = join(stateDir, "state.json");
  out = [];
  err = [];
  env = { PATH: `${SHIMS}:${process.env.PATH}`, GH_SHIM_STATE: statePath, HOME: process.env.HOME };
});

// A fresh io each call so cwd/env are honored while out/err accumulate.
function io(over = {}) {
  return { cwd, env, stdout: (s) => out.push(s), stderr: (s) => err.push(s), ...over };
}

const CREATE = [
  "create",
  "--title", "GH backend quest",
  "--objective", "Prove the github backend round-trips.",
  "--done-when", "lifecycle round-trips through gh",
  "--validation", "node --test",
];

test("init --backend github requires auth, creates labels, writes local github config", async () => {
  assert.equal(await run(["init", "--backend", "github", "--repo", "o/r"], io()), 0);
  assert.match(out.join("\n"), /Store ready: github backend/);
  const cfg = JSON.parse(readFileSync(join(cwd, ".quests", "config.json"), "utf8"));
  assert.equal(cfg.backend, "github");
  assert.equal(cfg.github.repo, "o/r");
});

test("github show --json is byte-identical in shape to the equivalent local record", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  assert.equal(await run(CREATE, io()), 0);
  out.length = 0;
  assert.equal(await run(["show", "1", "--json"], io()), 0);
  const gh = JSON.parse(out[0]);

  // Equivalent local record in its own store.
  const localCwd = mkdtempSync(join(tmpdir(), "quest-local-"));
  const lio = () => ({ cwd: localCwd, env: {}, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  await run(["init"], lio());
  await run(CREATE, lio());
  out.length = 0;
  await run(["show", "1", "--json"], lio());
  const local = JSON.parse(out[0]);

  assert.deepEqual(Object.keys(gh).sort(), Object.keys(local).sort());
  for (const k of ["id", "title", "status", "priority", "worker", "model", "max_iterations", "body", "checkpoints"]) {
    assert.deepEqual(gh[k], local[k], `field ${k} differs between backends`);
  }
});

test("github lifecycle: start → checkpoint → complete, with identical checkpoint comment bytes", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io());

  assert.equal(await run(["start", "1"], io()), 0);
  assert.equal(await run(["checkpoint", "1", "--status", "in_progress", "--summary", "M1 done", "--validation", "`node --test` → green"], io()), 0);
  assert.equal(await run(["checkpoint", "1", "--status", "complete", "--summary", "all done", "--validation", "`node --test` → 10 passed"], io()), 0);

  out.length = 0;
  assert.equal(await run(["show", "1", "--json"], io()), 0);
  const done = JSON.parse(out[0]);
  assert.equal(done.status, "complete");
  assert.equal(done.checkpoints.length, 2);
  assert.equal(done.checkpoints[1].quest_status, "complete");

  // The stored comment bytes carry the checkpoint marker verbatim.
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const comments = state.issues["1"].comments;
  assert.equal(comments.length, 2);
  assert.ok(comments.every((c) => c.body.includes("<!-- quest:checkpoint -->")));
  // Complete mirrors onto issue state (closed as completed).
  assert.equal(state.issues["1"].state, "CLOSED");
  assert.equal(state.issues["1"].stateReason, "COMPLETED");
  assert.ok(state.issues["1"].labels.some((l) => l.name === "quest:complete"));

  // list --json reflects the completed quest and its checkpoint count.
  out.length = 0;
  assert.equal(await run(["list", "--json"], io()), 0);
  const list = JSON.parse(out[0]);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "complete");
  assert.equal(list[0].checkpoints, 2);

  // lint --all reconstructs and passes the contract.
  assert.equal(await run(["lint", "--all"], io()), 0);
});

test("github reopen: complete → in_progress reopens the issue, swaps the label, comments the reopen_reason", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io());
  await run(["start", "1"], io());
  await run(["checkpoint", "1", "--status", "complete", "--summary", "all done", "--validation", "`node --test` → 10 passed"], io());

  // Precondition: the completed issue is CLOSED and carries quest:complete.
  let state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.issues["1"].state, "CLOSED");
  assert.ok(state.issues["1"].labels.some((l) => l.name === "quest:complete"));

  assert.equal(await run(["reopen", "1", "--reason", "review found npm audit criticals"], io()), 0);

  state = JSON.parse(readFileSync(statePath, "utf8"));
  // Issue is OPEN again, label swapped complete → in-progress.
  assert.equal(state.issues["1"].state, "OPEN");
  assert.ok(state.issues["1"].labels.some((l) => l.name === "quest:in-progress"));
  assert.ok(!state.issues["1"].labels.some((l) => l.name === "quest:complete"));
  // Comment-first order: the reopen appends one audited checkpoint comment
  // (complete checkpoint + reopen checkpoint = 2 comments on this issue).
  const comments = state.issues["1"].comments;
  assert.equal(comments.length, 2);
  const reopenComment = comments.at(-1);
  assert.ok(reopenComment.body.includes("<!-- quest:checkpoint -->"));
  assert.match(reopenComment.body, /quest_status: in_progress/);
  assert.match(reopenComment.body, /- reopen_reason: review found npm audit criticals/);

  // show --json now reports in_progress and lint --all stays clean.
  out.length = 0;
  assert.equal(await run(["show", "1", "--json"], io()), 0);
  assert.equal(JSON.parse(out[0]).status, "in_progress");
  assert.equal(await run(["lint", "--all"], io()), 0);
});

test("github reopen without --reason exits 5 and mutates nothing", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io());
  await run(["start", "1"], io());
  await run(["checkpoint", "1", "--status", "complete", "--summary", "done", "--validation", "`node --test` → 10 passed"], io());
  const before = readFileSync(statePath, "utf8");
  assert.equal(await run(["reopen", "1"], io()), 5);
  assert.match(err.join("\n"), /reason/);
  assert.equal(readFileSync(statePath, "utf8"), before, "no gh mutation on a missing reason");
});

test("github edit on a complete quest exits 5 and comments nothing", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io());
  await run(["start", "1"], io());
  await run(["checkpoint", "1", "--status", "complete", "--summary", "done", "--validation", "`node --test` → 10 passed"], io());
  const commentsBefore = JSON.parse(readFileSync(statePath, "utf8")).issues["1"].comments.length;
  assert.equal(await run(["edit", "1", "--add-done-when", "late add", "--rationale", "missed a case"], io()), 5);
  assert.match(err.join("\n"), /complete/);
  const commentsAfter = JSON.parse(readFileSync(statePath, "utf8")).issues["1"].comments.length;
  assert.equal(commentsAfter, commentsBefore, "edit on complete must not comment");
});

test("illegal transition (todo → complete) exits 5 and mutates nothing", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io());
  assert.equal(await run(["checkpoint", "1", "--status", "complete", "--summary", "x", "--validation", "`y`"], io()), 5);
  assert.match(err.join("\n"), /illegal status transition: todo → complete/);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.issues["1"].comments.length, 0);
  assert.equal(state.issues["1"].state, "OPEN");
});

test("child quest links into the parent's ## Children task list", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io()); // parent = #1
  assert.equal(await run([...CREATE, "--title", "Child quest", "--parent", "1"], io()), 0); // child = #2
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.match(state.issues["1"].body, /## Children/);
  assert.match(state.issues["1"].body, /- \[ \] #2/);
  assert.match(state.issues["2"].body, /parent: 1/);
});

test("queue state separates worker-ready quests from inline-close-ready epics (github parity)", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io()); // epic = #1
  await run([...CREATE, "--title", "Child one", "--parent", "1"], io()); // #2
  await run([...CREATE, "--title", "Child two", "--parent", "1"], io()); // #3

  const readyIds = async () => {
    out.length = 0;
    await run(["list", "--ready", "--json"], io());
    return JSON.parse(out[0]).map((q) => q.id);
  };
  const queue = async () => {
    out.length = 0;
    await run(["list", "--queue", "--json"], io());
    return JSON.parse(out[0]);
  };

  // Both children open → epic gated out; children themselves are ready.
  assert.deepEqual(await readyIds(), [2, 3]);

  // Complete one child, cancel the other → both terminal → epic is inline-close-ready, not worker-ready.
  await run(["start", "2"], io());
  await run(["checkpoint", "2", "--status", "complete", "--summary", "done", "--validation", "`node --test` → green"], io());
  assert.ok(!(await readyIds()).includes(1), "epic ready with one child still open");
  await run(["cancel", "3", "--reason", "descoped"], io());
  assert.ok(!(await readyIds()).includes(1), "epic must not be worker-dispatchable");
  assert.deepEqual((await queue()).inline_close_ready_epics.map((q) => q.id), [1], "cancelled child must not wedge inline epic closure");
});

test("github lint --all reports hand-corrupted missing parent and dependency references", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  await run(CREATE, io()); // #1
  await run([...CREATE, "--title", "Child quest", "--parent", "1"], io()); // #2
  await run([...CREATE, "--title", "Dependency", "--depends-on", "1"], io()); // #3

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.issues["2"].body = state.issues["2"].body.replace("parent: 1", "parent: 999");
  state.issues["3"].body = state.issues["3"].body.replace("depends_on: [1]", "depends_on: [998]");
  writeFileSync(statePath, JSON.stringify(state));

  assert.equal(await run(["lint", "--all"], io()), 5);
  assert.match(err.join("\n"), /parent references unknown quest 999/);
  assert.match(err.join("\n"), /depends_on references unknown quest 998/);
});

test("missing gh exits 6 and never falls back to local", async () => {
  await run(["init", "--backend", "github", "--repo", "o/r"], io());
  const badEnv = { PATH: "/nonexistent-quest-test-bin", GH_SHIM_STATE: statePath };
  assert.equal(await run(["list"], io({ env: badEnv })), 6);
  assert.match(err.join("\n"), /gh/);
});

test("gh auth failure exits 6 with gh's stderr surfaced", async () => {
  const failEnv = { ...env, GH_SHIM_FAIL_AUTH: "1" };
  assert.equal(await run(["init", "--backend", "github", "--repo", "o/r"], io({ env: failEnv })), 6);
  assert.match(err.join("\n"), /not logged in/i);
});
