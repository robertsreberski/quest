---
id: 18
title: SubagentStop hook: do not block read-only agents (reviewers)
status: complete
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T22:04:45Z
updated: 2026-07-07T22:11:22Z
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
Evidence: quest 16 reviewer (2026-07-07T22:00:00Z) — a read-only quest-reviewer agent — was blocked at stop demanding a checkpoint on quest 15, which it had merely inspected via quest show 15 --json while verifying depends_on; quest 15 was terminal-complete with its last checkpoint older than the reviewer start, so neither clear condition fired. Same class of report-eating false positive as quest 17 fixed for prose matches. Anchors: hooks/subagent-stop.mjs executorQuestId/markerIdInEntry (added by quest 17), MARKER regex ~line 30.

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T22:11:22Z — quest_status: complete
- iteration: 1
- changed: Re-keyed SubagentStop executor detection from the read-only 'quest show <id> --json' marker to mutating verbs: MARKER = /\bquest\s+(start|checkpoint)\s+(\d+)/ (group2 = id) matches quest start/checkpoint under any binary prefix (quest, ./bin/quest, node bin/quest) inside tool_use command inputs only. Read-only agents (show/list/protocol/runs) match nothing so executorQuestId returns null and they are allowed silently. First mutating invocation wins (transcript order). Checkpoint invocations also key detection so a resumed in_progress quest (which skips start) is still caught. Updated the two quest 17 fixtures (executor, skill-prose, multi-invocation) to carry mutating-verb invocations/prose keeping their prose-never-keys regression intent, and added readonly-reviewer (quest 16 regression) and checkpoint-first fixtures + tests. Header comment and CHANGELOG updated.
- validation_summary: `npm test` -> tests 99 / pass 99 / fail 0 (was 97; +2 new hook tests); `node scripts/check-hygiene.mjs` -> hygiene: OK (exit 0); no /Users paths in touched files (`grep -rn /Users/` -> no matches)

Done-when: (1) DONE mutating-verb marker; read-only allowed silently — readonly-reviewer test asserts empty stdout. (2) DONE quest 16 regression: readonly reviewer with real 'quest show' calls + no mutating verb allowed; executor with 'quest start' + no post-start checkpoint still blocked. (3) DONE conservative allow + checkpoint-newer-than-start + terminal-during-run preserved; all prior hook tests green. (4) DONE npm test 99/99.
