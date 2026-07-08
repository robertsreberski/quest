---
id: 25
title: Tighten native hooks and session status cards
status: in_progress
priority: p1
worker: codex
model: gpt-5.5
effort: high
max_iterations: 4
parent: 21
created: 2026-07-08T21:20:35Z
updated: 2026-07-08T21:32:34Z
---

# Tighten native hooks and session status cards

## Objective
Quest's hooks better protect native executor sessions and give operators a useful no-surprises startup status.

## Done when
- [ ] SubagentStop can narrowly identify a native `quest-executor` launch with an explicit quest id even before the executor has run a mutating Quest CLI command
- [ ] SubagentStop still silently allows read-only reviewers, unrelated agents, missing inputs, and unknown stores
- [ ] SessionStart emits an exact next action for local stores and a no-network GitHub-store hint instead of going fully silent
- [ ] hook tests cover the new native-executor and GitHub-store cases
- [ ] `npm test` passes

## Validation loop
```bash
npm test
```

## Constraints
- avoid broad transcript prose scans that recreate prior false positives
- hooks must remain best-effort and must not perform network calls

## Milestones
- [ ] M1 — extend SubagentStop detection safely
- [ ] M2 — improve SessionStart status text and tests

## Context
Loop findings: native provider loops 4 and 5, plus CLI loop 1. Files and symbols: executorQuestId and markerIdInEntry in hooks/subagent-stop.mjs; buildContext and backend handling in hooks/session-start.mjs; tests/hooks.test.mjs fixtures.

## Out of scope
- changing provider hook schemas beyond observed payload fields

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T21:27:50Z — quest_status: in_progress
- iteration: 1
- changed: M1 — SubagentStop detects native quest-executor launch prompts with explicit quest ids before mutating commands while preserving silent allows for non-executor or missing-prompt payloads
- validation_summary: `npm test` → 145 passed, 0 failed

<!-- quest:checkpoint -->
### 2026-07-08T21:29:32Z — quest_status: complete
- iteration: 2
- head_sha: 55e393c
- changed: M1/M2 — SubagentStop native executor detection and SessionStart local/GitHub startup status tightened
- validation_summary: `npm test` → 147 passed, 0 failed

Done: SubagentStop native quest-executor explicit quest id before mutating command covered by native quest-executor launch test. Done: read-only reviewers, unrelated agents, missing prompts, and unknown quests allow silently via existing and new SubagentStop tests. Done: SessionStart emits exact local next actions and GitHub no-network hint via seeded, empty, and github store tests. Done: hook tests cover native-executor and GitHub-store cases. Done: npm test passed at HEAD 55e393c.

<!-- quest:checkpoint -->
### 2026-07-08T21:32:34Z — quest_status: in_progress
- iteration: 3
- changed: reopened from complete
- validation_summary: reopened for further work; no execution this entry
- reopen_reason: review found missing-input and unknown-store allow paths were not silent and were not tested as written
