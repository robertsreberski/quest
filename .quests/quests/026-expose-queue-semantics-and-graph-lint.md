---
id: 26
title: Expose queue semantics and graph lint
status: complete
priority: p1
worker: codex
model: gpt-5.5
effort: high
max_iterations: 5
parent: 21
depends_on: [22, 25]
created: 2026-07-08T21:20:42Z
updated: 2026-07-08T21:43:44Z
---

# Expose queue semantics and graph lint

## Objective
Quest distinguishes worker-dispatchable work from inline epic closure and catches corrupted quest graph references during lint.

## Done when
- [ ] local and GitHub backends share the same queue/readiness computation for worker-ready quests, inline-close-ready epics, and blocked reasons
- [ ] a command or JSON option exposes inline-close-ready epics without making them look worker-dispatchable
- [ ] `quest lint --all` reports missing parent and dependency references in hand-corrupted stores
- [ ] runner ready-wave behavior remains compatible and never auto-dispatches epics
- [ ] `npm test` passes

## Validation loop
```bash
npm test
```

## Constraints
- preserve existing `quest list --ready` behavior unless tests and docs intentionally update it
- GitHub backend failures must still surface gh stderr and never fall back to local

## Milestones
- [ ] M1 — extract shared queue/graph logic with local and GitHub tests
- [ ] M2 — add lint graph checks and operator-visible queue output

## Context
Loop findings: contract/store loops 3, 4, and 5; runner loop 2. Files and symbols: readyQuests and lintAll in lib/store-local.mjs and lib/store-github.mjs; runReady in lib/runner.mjs; tests/store-local.test.mjs; tests/store-github.test.mjs; tests/runner.test.mjs.

## Out of scope
- requiring structured final done-evidence in checkpoint format

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-08T21:43:44Z — quest_status: complete
- iteration: 1
- head_sha: 449177b
- changed: M1/M2 done — shared queue graph logic, queue output, lint graph checks, and runner epic handling
- validation_summary: `npm test` → 158 passed, 0 failed

Done — local and GitHub backends share computeQueue/lintGraphReferences in lib/graph.mjs, with worker_ready, inline_close_ready_epics, and blocked reasons covered by tests/store-local.test.mjs and tests/store-github.test.mjs.\nDone — quest list --queue --json exposes inline_close_ready_epics while quest list --ready stays worker-dispatchable only, covered by tests/cli.test.mjs.\nDone — quest lint --all reports missing parent and depends_on references in hand-corrupted local and GitHub stores, covered by tests/store-local.test.mjs and tests/store-github.test.mjs; live quest lint --all returned OK (26 records).\nDone — quest-run --ready consumes queue output and reports inline-close-ready epics without dispatching workers, covered by tests/runner.test.mjs.\nDone — npm test returned 158 passed, 0 failed.
