import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("orchestrate documents native subagents and goal-mode fallbacks for Codex and Claude", () => {
  const text = read("skills/orchestrate/SKILL.md");

  assert.match(text, /create_goal/);
  assert.match(text, /get_goal/);
  assert.match(text, /\/goal/);
  assert.match(text, /spawn_agent/);
  assert.match(text, /tool_search/);
  assert.match(text, /quest-executor/);
  assert.match(text, /quest-reviewer/);
  assert.match(text, /update_goal/);
  assert.match(text, /--codex-goal-mode require/);
  assert.match(text, /Do not implement product code inline/);
  assert.match(text, /default path is native subagents/);
  assert.match(text, /If `spawn_agent` is not visible, call `tool_search` once/);
  assert.match(text, /Use `quest-run` only when native subagents are still unavailable/);
  assert.match(text, /every quest in the scoped wave shows complete, blocked, or cancelled in\s+`quest list --json` output/);
  assert.match(text, /every quest in this wave shows complete, blocked, or cancelled in `quest list --json` output/);
  assert.doesNotMatch(text, /quest_status is [^`\n]*cancelled/);
});

test("plan skill hands accepted Plan Mode work to orchestrate", () => {
  const text = read("skills/plan/SKILL.md");

  assert.match(text, /Codex Plan Mode/);
  assert.match(text, /do \*\*not\*\* implement product code/);
  assert.match(text, /\$quest:orchestrate/);
  assert.match(text, /same parent agent\/session that processes `\$quest:plan` owns the\s+handoff/);
  assert.match(text, /asked to implement it, the same parent\s+session becomes `\$quest:orchestrate`, not `\$quest:work`/);
  assert.match(text, /spawn\s+goal-mode workers/);
  assert.match(text, /Stop after listing the ready quest ids and validation commands only when the\s+user explicitly asked for create-only\/no-dispatch behavior/);
  assert.match(text, /"only\s+create quests", "do not dispatch", or "stop after planning"/);
  assert.doesNotMatch(text, /ask whether to enter\s+`\$quest:orchestrate`/);
  assert.doesNotMatch(text, /Do not silently\s+switch modes/);
  assert.match(text, /parent session never uses `\$quest:work <id>` after a Plan Mode handoff/);
  assert.match(text, /always specify all three explicitly/);
  assert.match(text, /`--worker`, `--model`, and `--effort`/);
  assert.match(text, /quest create --worker codex --model gpt-5\.5 --effort medium --max-iterations 4/);
});

test("Claude and Codex agent templates require native goal mode", () => {
  const executorMd = read("agents/quest-executor.md");
  const reviewerMd = read("agents/quest-reviewer.md");
  const executorToml = read("agents/quest-executor.toml");
  const reviewerToml = read("agents/quest-reviewer.toml");

  assert.match(executorMd, /\/goal quest <id>/);
  assert.match(reviewerMd, /\/goal return an accept or iterate verdict/);

  for (const text of [executorToml, reviewerToml]) {
    assert.match(text, /create_goal/);
    assert.match(text, /get_goal/);
    assert.match(text, /update_goal/);
  }
});
