---
id: 18
title: SubagentStop hook: do not block read-only agents (reviewers)
status: in_progress
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T22:04:45Z
updated: 2026-07-07T22:07:09Z
---

# SubagentStop hook: do not block read-only agents (reviewers)

## Objective
The hook currently treats any subagent that ran a real quest show <id> --json invocation as a quest-executor; reviewer agents do that legitimately and get blocked at stop when the reviewed quest is long-terminal. Key executor detection to mutating quest verbs so read-only agents are never blocked.

## Done when
- [ ] the hook keys executor detection to real mutating invocations (quest start <id> and/or quest checkpoint <id>), taking the quest id from those; agents whose transcripts contain only read verbs (show/list/protocol/runs) are allowed silently
- [ ] a regression test reproduces the quest 16 reviewer block: a synthetic transcript with real quest show invocations but no mutating verb is allowed; an executor transcript with quest start + no post-start checkpoint is still blocked
- [ ] existing hook behavior preserved: conservative allow on missing/unreadable/unparseable input, checkpoint-newer-than-start clears, terminal-status-during-run clears; all existing hook tests green
- [ ] `npm test` passes including the new tests in tests/hooks.test.mjs

## Validation loop
```bash
npm test
```

## Constraints
- keep the hook zero-dependency; any ambiguity resolves to allow
- do not weaken the executor block: an agent that ran quest start <id> or a quest checkpoint invocation and stopped without a fresh checkpoint must still be blocked

## Context
Evidence: quest 16 reviewer (2026-07-07T22:0xZ) — a read-only quest-reviewer agent — was blocked at stop demanding a checkpoint on quest 15, which it had merely inspected via quest show 15 --json while verifying depends_on; quest 15 was terminal-complete with its last checkpoint older than the reviewer start, so neither clear condition fired. Same class of report-eating false positive as quest 17 fixed for prose matches. Anchors: hooks/subagent-stop.mjs executorQuestId/markerIdInEntry (added by quest 17), MARKER regex ~line 30.

## Checkpoints
