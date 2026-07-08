---
id: 25
title: Tighten native hooks and session status cards
status: todo
priority: p1
worker: codex
model: gpt-5.5
effort: high
max_iterations: 4
parent: 21
created: 2026-07-08T21:20:35Z
updated: 2026-07-08T21:20:35Z
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
