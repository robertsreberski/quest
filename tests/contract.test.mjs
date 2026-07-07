import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransition, ContractError, lintRecord, makeCheckpoint, parseCheckpoints, parseRecord, recordFilename, serializeRecord, slugify } from "../lib/contract.mjs";

const TS = "2026-07-07T12:00:00Z";
const FRONT = { id: 1, title: "Test quest", status: "todo", priority: "p1", worker: "claude", model: "inherit", max_iterations: 8, created: TS, updated: TS };
const BODY = ["# Test quest", "", "## Objective", "Do the thing.", "", "## Done when", "- [ ] it works", "", "## Validation loop", "```bash", "npm test", "```", "", "## Checkpoints", ""].join("\n");

test("slugify truncates at word boundaries", () => {
  assert.equal(slugify("Add --json output to the list command"), "add-json-output-to-the-list-command");
  assert.ok(slugify("a".repeat(60)).length <= 40);
  assert.ok(!slugify("one two three four five six seven eight nine ten eleven").endsWith("-"));
  assert.equal(slugify("!!!"), "quest");
});

test("recordFilename pads id", () => {
  assert.equal(recordFilename(7, "Fix bug"), "007-fix-bug.md");
});

test("record round-trips through serialize/parse", () => {
  const text = serializeRecord(FRONT, BODY);
  const { front, body } = parseRecord(text);
  assert.deepEqual(front, FRONT);
  assert.ok(body.includes("## Objective"));
});

test("lint passes a canonical record", () => {
  assert.deepEqual(lintRecord({ front: FRONT, body: BODY, checkpoints: [] }), []);
});

test("lint catches missing sections, bad enums, unknown keys", () => {
  const problems = lintRecord({ front: { ...FRONT, status: "doing", extra: 1 }, body: "# t\n\n## Objective\nx\n", checkpoints: [] });
  assert.ok(problems.some((p) => p.includes('status must be')));
  assert.ok(problems.some((p) => p.includes('unknown frontmatter key "extra"')));
  assert.ok(problems.some((p) => p.includes('"## Done when"')));
  assert.ok(problems.some((p) => p.includes('"## Validation loop"')));
});

test("lint enforces section order", () => {
  const disordered = ["# t", "", "## Done when", "- [ ] x", "", "## Objective", "y", "", "## Validation loop", "```bash", "z", "```", ""].join("\n");
  const problems = lintRecord({ front: FRONT, body: disordered, checkpoints: [] });
  assert.ok(problems.some((p) => p.includes("canonical order")));
});

test("makeCheckpoint requires fields and enum", () => {
  assert.throws(() => makeCheckpoint({ timestamp: TS, quest_status: "todo", iteration: 1, changed: "x", validation_summary: "y" }), ContractError);
  assert.throws(() => makeCheckpoint({ timestamp: TS, quest_status: "in_progress", iteration: 1, changed: "x" }), /validation_summary/);
});

test("complete checkpoint demands backticked commands", () => {
  assert.throws(() => makeCheckpoint({ timestamp: TS, quest_status: "complete", iteration: 1, changed: "done", validation_summary: "all good" }), /backticked/);
  const ok = makeCheckpoint({ timestamp: TS, quest_status: "complete", iteration: 1, changed: "done", validation_summary: "`npm test` → 3 passed" });
  assert.ok(ok.includes("quest_status: complete"));
});

test("multi-line checkpoint fields are rejected", () => {
  assert.throws(() => makeCheckpoint({ timestamp: TS, quest_status: "in_progress", iteration: 1, changed: "a\nb", validation_summary: "x" }), /single line/);
});

test("checkpoints round-trip through parseCheckpoints", () => {
  const block = makeCheckpoint({ timestamp: TS, quest_status: "in_progress", iteration: 2, changed: "did stuff", validation_summary: "`npm test` green", failed_approaches: "tried X", note: "extra prose" });
  const cps = parseCheckpoints(`${BODY}\n${block}\n`);
  assert.equal(cps.length, 1);
  assert.equal(cps[0].quest_status, "in_progress");
  assert.equal(cps[0].fields.iteration, "2");
  assert.equal(cps[0].fields.failed_approaches, "tried X");
  assert.equal(cps[0].note, "extra prose");
});

test("status transitions enforce the lifecycle", () => {
  assertTransition("todo", "in_progress");
  assertTransition("in_progress", "complete");
  assertTransition("blocked", "in_progress");
  assert.throws(() => assertTransition("todo", "complete"), /illegal/);
  const terminal = (() => { try { assertTransition("complete", "in_progress"); } catch (e) { return e; } })();
  assert.match(terminal.message, /illegal/);
  assert.match(terminal.hint, /terminal/);
});

test("lint flags complete status without a complete checkpoint", () => {
  const problems = lintRecord({ front: { ...FRONT, status: "complete" }, body: BODY, checkpoints: [] });
  assert.ok(problems.some((p) => p.includes("last checkpoint")));
});
