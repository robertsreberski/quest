---
id: 16
title: Epic readiness gate and orchestrator-side closure
status: complete
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
depends_on: [15]
created: 2026-07-07T21:07:04Z
updated: 2026-07-07T21:54:43Z
---

# Epic readiness gate and orchestrator-side closure

## Objective
Parents with non-terminal children never appear ready or get auto-dispatched, and epics are closed by the orchestrator inline (verify children, run the epic validation loop, checkpoint) instead of burning a worker run.

## Done when
- [ ] readyQuests in both store-local.mjs and store-github.mjs excludes any quest that has at least one child (quest whose parent points at it) not in complete/cancelled
- [ ] quest-run --ready never auto-dispatches a quest that has children, logging an actionable close-it-per-/quest:orchestrate line; direct quest-run <id> stays allowed
- [ ] skills/orchestrate/SKILL.md gains a "Closing an epic" section: verify children via quest list --parent <id> --json, run the epic validation loop inline, quest start plus quest checkpoint --status complete enumerating each child and each epic Done-when item — zero worker tokens
- [ ] skills/plan/SKILL.md documents that epic Done-when is integration-level only and epic milestones must not mirror children 1:1
- [ ] docs updated: help.mjs --ready flag text, contract-spec.md parent row, protocol.md sizing note, README quest-run note, CHANGELOG Changed entry for wave-composition change
- [ ] `npm test && npm run check:parity && npm run check:hygiene` passes with new tests: epic absent from --ready until children terminal and cancelled child unblocks (store-local + store-github), --ready never dispatches an epic — no run_started event for the epic id and stderr matches /is an epic/ (runner.test.mjs)

## Validation loop
```bash
npm test && npm run check:parity && npm run check:hygiene
```

## Constraints
- no close-epic CLI execution command — the quest CLI never executes user commands (single-write-path, zero-exec philosophy); closure guidance lives in the orchestrate skill
- cancelled children must not wedge the epic forever

## Milestones
- [ ] M1 — readyQuests children gate in both backends plus tests
- [ ] M2 — quest-run --ready epic skip in runner.mjs runReady plus runner test
- [ ] M3 — skills guidance (orchestrate + plan), docs, CHANGELOG

## Context
Design fixed at filing time (retro of the test-mario store); ruling: epics stay quests but are closed by the orchestrator, never dispatched. Anchors: readyQuests store-local.mjs ~85-91 (github twin promises parity in its comment), runReady runner.mjs ~543-551. Evidence: ../test-mario run ury9z3iz burned 649k tokens closing epic 1 with pure verification; epic 1 sat "ready" from creation because readiness only checks depends_on. Depends on quest 15 for the shared runner.mjs/spec surface.

## Out of scope
- ledger event shape changes (no_op marker, run_started metadata) — candidate follow-up quest

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T21:50:00Z — quest_status: in_progress
- iteration: 1
- head_sha: 365d1e2
- changed: M1 done — readyQuests epic gate added in store-local.mjs and store-github.mjs (parent with any non-terminal child excluded; cancelled child is terminal and unblocks)
- validation_summary: `node --test tests/store-local.test.mjs tests/store-github.test.mjs` → 26 passed 0 fail; `npm test` → 96 passed 0 fail; `npm run check:parity` → parity: OK; `npm run check:hygiene` → hygiene: OK

<!-- quest:checkpoint -->
### 2026-07-07T21:51:44Z — quest_status: in_progress
- iteration: 2
- head_sha: 422aba9
- changed: M2 done — runReady in runner.mjs skips ready epics (quests other quests name as parent), logs actionable /quest:orchestrate close-inline line, dispatches no worker; direct quest-run <id> stays allowed
- validation_summary: `node --test tests/runner.test.mjs` → 22 passed 0 fail (new epic-skip test asserts no run_started for epic id + stderr /is an epic/ + direct run completes); `npm test` → 97 passed 0 fail; `npm run check:parity` → parity: OK; `npm run check:hygiene` → hygiene: OK

<!-- quest:checkpoint -->
### 2026-07-07T21:54:43Z — quest_status: complete
- iteration: 3
- head_sha: 0618aaf
- changed: M3 done — orchestrate 'Closing an epic' section, plan integration-level epic guidance, and docs (help --ready text, contract-spec parent row, protocol sizing note, README quest-run note, CHANGELOG Changed entry). All three milestones complete.
- validation_summary: `npm test && npm run check:parity && npm run check:hygiene` → ALL GREEN: npm test → 97 pass 0 fail; parity: OK; hygiene: OK. New tests: store-local epic-gate + cancelled-child-unblock; store-github parity; runner --ready epic-skip (no run_started for epic id, stderr /is an epic/, direct quest-run <id> completes).

Done-when: (1) readyQuests epic gate in store-local.mjs + store-github.mjs — Done (openParents set; parity tests). (2) quest-run --ready refuses epics with actionable /quest:orchestrate line, direct run allowed — Done (runReady epicIds skip; runner test). (3) orchestrate 'Closing an epic' — Done. (4) plan integration-level epic Done-when, no 1:1 milestones — Done. (5) docs: help.mjs, contract-spec.md, protocol.md, README, CHANGELOG — Done (all five). (6) validation loop + new tests green — Done.
