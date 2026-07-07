---
id: 6
title: SessionStart and SubagentStop hooks
status: todo
priority: p1
worker: claude
model: inherit
max_iterations: 6
depends_on: [2, 4]
created: 2026-07-07T13:12:31Z
updated: 2026-07-07T13:12:31Z
---

# SessionStart and SubagentStop hooks

## Objective
Ship the two Claude Code hooks: a SessionStart summary of in-flight quests and
active runs, and a SubagentStop blocker that prevents quest-executor subagents
from stopping without recording a checkpoint.

## Done when
- [ ] SessionStart: when a `.quests/` store exists upward of cwd, injects a
      one-paragraph summary (in-flight/blocked quests + active runs); silent
      no-op otherwise (no store ≠ error).
- [ ] SubagentStop: detects quest-executor transcripts via the deterministic
      marker (a `quest show <id> --json` invocation), extracts the id, compares
      the latest checkpoint timestamp against subagent start; blocks with a
      corrective reason when no new checkpoint exists.
- [ ] Fixture tests: executor-with-checkpoint passes; executor-without blocks;
      unrelated subagent transcript untouched.
- [ ] Live verification: a deliberately checkpoint-skipping executor gets
      blocked and then complies.

## Validation loop
```bash
node --test tests/hooks.test.mjs
node --test tests/
```

## Constraints
- Strict marker scoping — zero false positives on non-quest subagents.
- Hooks read state via the `quest` CLI; they never write records.
- Hook scripts are fast (SessionStart adds no perceptible session latency).

## Context
Hook registration: `hooks/hooks.json` referencing `${CLAUDE_PLUGIN_ROOT}`.
Blocking contract: JSON `{"ok": false, "reason": …}` / exit 2, 8-block cap.

## Out of scope
- Codex-side stop enforcement (covered deterministically by the runner).

## Checkpoints
