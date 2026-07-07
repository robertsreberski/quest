---
id: 15
title: quest reopen verb: audited path from complete back into the loop
status: in_progress
priority: p1
worker: claude
model: opus
effort: xhigh
max_iterations: 8
created: 2026-07-07T21:06:46Z
updated: 2026-07-07T21:13:05Z
---

# quest reopen verb: audited path from complete back into the loop

## Objective
Add `quest reopen <id> --reason` so a completed quest can legally re-enter the loop with an audited reopen checkpoint, replacing the hand-edit-of-terminal-status workaround observed in the test-mario retro.

## Done when
- [ ] `quest reopen <id> --reason "…"` flips complete to in_progress on both local and github backends, appending a checkpoint carrying a new optional reopen_reason field; missing --reason exits 5; non-complete statuses are rejected by a new assertReopen in lib/contract.mjs
- [ ] assertTransition("complete","in_progress") still throws; its hint now points at quest reopen and keeps the word terminal (contract.test.mjs asserts on it)
- [ ] github backend reopens the issue and swaps quest:complete to quest:in-progress via the existing applyStatus path, comment-first operation order
- [ ] quest-run early-exit stderr on an already-complete quest suggests quest reopen <id> --reason
- [ ] editQuest on a complete or cancelled quest errors with a reopen-it-first / file-a-new-quest hint on both backends
- [ ] reopened records lint clean before and after re-completion; no lint rules added or tightened
- [ ] surfaces updated: lib/store.mjs seam, lib/cli.mjs handler modeled on cancel, lib/help.mjs COMMANDS.reopen plus regenerated tests/snapshots/help-general.txt, contract-spec.md transitions and checkpoint fields, protocol.md, skills/orchestrate/SKILL.md "Reopening completed work" note, README CLI table
- [ ] `npm test` passes with new tests in tests/contract.test.mjs (assertReopen matrix, reopen_reason round-trip), tests/store-local.test.mjs (reopen-to-recomplete lifecycle lint-clean, edit-on-complete throws), tests/store-github.test.mjs (shim shows issue OPEN, label swap, checkpoint comment with reopen_reason), tests/cli.test.mjs (exit 5 on missing reason)

## Validation loop
```bash
npm test
```

## Constraints
- do not widen TRANSITIONS.complete — reopen is a separate assertReopen path used only by the reopen verb; a checkpoint can never resurrect a complete quest
- cancelled stays fully terminal
- reopened quests do not re-enter quest list --ready (status in_progress); they are dispatched directly by id
- reopening a child of a complete parent epic is allowed with a stderr warning, never blocked

## Milestones
- [ ] M1 — contract.mjs: assertReopen, reopen_reason checkpoint field, terminal-hint update, unit tests
- [ ] M2 — store-local.mjs: reopenQuest modeled on cancelQuest, editQuest terminal guard, tests
- [ ] M3 — store-github.mjs: reopenQuest via applyStatus, editQuest guard, store.mjs seam, shim tests
- [ ] M4 — cli.mjs + help.mjs: reopen handler, help entry, regenerated help-general snapshot, runner early-exit stderr hint, tests
- [ ] M5 — docs: contract-spec.md, protocol.md, orchestrate SKILL.md, README

## Context
Full design in approved plan /Users/robertsreberski/.claude/plans/please-evaluate-test-mario-project-quizzical-haven.md (Quest A section). Model reopenQuest on cancelQuest (store-local.mjs ~156, store-github.mjs ~363) and the cli cancel handler (~301). Evidence: ../test-mario retro — run otviq41n was a 0-iteration no-op on a complete quest, followed by an uncommitted hand-edit of the status line so run qdeadkg5 could fix review-found npm audit criticals; post-epic defects were fixed by manual commits 85a014e/4737c48 outside the loop.

## Out of scope
- ledger truthfulness changes (cost_usd null semantics, no_op marker, run_started metadata)
- checkbox template changes and codex token_usage breakdown

## Checkpoints

<!-- quest:checkpoint -->
### 2026-07-07T21:13:05Z — quest_status: in_progress
- iteration: 1
- changed: M1: contract.mjs assertReopen(from) (only complete reopenable; cancelled stays terminal), optional reopen_reason field in makeCheckpoint, assertTransition complete-hint now points at quest reopen while keeping 'terminal'
- validation_summary: `npm test` → 83 passed, 0 failed (was 80; +3 contract tests: assertReopen matrix, reopen_reason round-trip, terminal-hint points at reopen)

TRANSITIONS.complete left as [] — assertReopen is a separate path used only by the reopen verb. Committed 7b56113.
