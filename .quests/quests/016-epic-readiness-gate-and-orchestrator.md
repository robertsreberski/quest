---
id: 16
title: Epic readiness gate and orchestrator-side closure
status: todo
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
depends_on: [15]
created: 2026-07-07T21:07:04Z
updated: 2026-07-07T21:07:04Z
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
Full design in approved plan /Users/robertsreberski/.claude/plans/please-evaluate-test-mario-project-quizzical-haven.md (Quest B section and Design ruling). Anchors: readyQuests store-local.mjs ~85-91 (github twin promises parity in its comment), runReady runner.mjs ~543-551. Evidence: ../test-mario run ury9z3iz burned 649k tokens closing epic 1 with pure verification; epic 1 sat "ready" from creation because readiness only checks depends_on. Depends on quest 15 for the shared runner.mjs/spec surface.

## Out of scope
- ledger event shape changes (no_op marker, run_started metadata) — candidate follow-up quest

## Checkpoints
